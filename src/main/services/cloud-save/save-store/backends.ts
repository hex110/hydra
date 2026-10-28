import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { SaveStoreConfig } from "@types";

/**
 * The few file operations the save store needs, over a folder or an rclone
 * remote. Paths are relative, with forward slashes.
 */
export interface SaveStoreBackend {
  readText(relative: string): Promise<string | null>;
  /** Several small files in one go; missing files are left out. */
  readTexts(relatives: string[]): Promise<Map<string, string>>;
  writeText(relative: string, text: string): Promise<void>;
  exists(relative: string): Promise<boolean>;
  /** Files under a directory, with paths relative to it; none when it is missing. */
  list(
    relative: string,
    options?: { recursive?: boolean }
  ): Promise<StoreEntry[]>;
  putFile(localPath: string, relative: string): Promise<void>;
  getFile(relative: string, localPath: string): Promise<void>;
  removeFile(relative: string): Promise<void>;
  removeDir(relative: string): Promise<void>;
}

export interface StoreEntry {
  path: string;
  sizeBytes: number;
  /** Milliseconds since the epoch, as the store reports it. */
  modifiedAt: number;
}

const isMissing = (error: unknown) =>
  (error as NodeJS.ErrnoException)?.code === "ENOENT";

export class FolderBackend implements SaveStoreBackend {
  constructor(private readonly root: string) {}

  private resolve(relative: string) {
    return path.join(this.root, ...relative.split("/"));
  }

  // Writes beside the target and renames, so readers never see half a file.
  private async writeTemp(
    target: string,
    write: (temp: string) => Promise<void>
  ) {
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${randomUUID()}.tmp`;
    await write(temp);
    return temp;
  }

  async readText(relative: string) {
    try {
      return await fs.promises.readFile(this.resolve(relative), "utf8");
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async readTexts(relatives: string[]) {
    const texts = new Map<string, string>();
    for (const relative of relatives) {
      const text = await this.readText(relative);
      if (text !== null) texts.set(relative, text);
    }
    return texts;
  }

  async writeText(relative: string, text: string) {
    const target = this.resolve(relative);
    const temp = await this.writeTemp(target, (file) =>
      fs.promises.writeFile(file, text, "utf8")
    );
    try {
      await fs.promises.rename(temp, target);
    } finally {
      await fs.promises.rm(temp, { force: true });
    }
  }

  async list(
    relative: string,
    { recursive = false }: { recursive?: boolean } = {}
  ) {
    const entries: StoreEntry[] = [];
    const walk = async (dir: string, prefix: string) => {
      let children: fs.Dirent[];
      try {
        children = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch (error) {
        if (isMissing(error)) return;
        throw error;
      }
      for (const child of children) {
        if (child.name.endsWith(".tmp")) continue;
        const childPath = path.join(dir, child.name);
        if (child.isDirectory()) {
          if (recursive) await walk(childPath, `${prefix}${child.name}/`);
        } else {
          const stat = await fs.promises.stat(childPath);
          entries.push({
            path: `${prefix}${child.name}`,
            sizeBytes: stat.size,
            modifiedAt: stat.mtimeMs,
          });
        }
      }
    };
    await walk(this.resolve(relative), "");
    return entries;
  }

  async removeFile(relative: string) {
    await fs.promises.rm(this.resolve(relative), { force: true });
  }

  async exists(relative: string) {
    try {
      await fs.promises.access(this.resolve(relative));
      return true;
    } catch {
      return false;
    }
  }

  async putFile(localPath: string, relative: string) {
    const target = this.resolve(relative);
    const temp = await this.writeTemp(target, (file) =>
      fs.promises.copyFile(localPath, file)
    );
    await fs.promises.rename(temp, target);
  }

  async getFile(relative: string, localPath: string) {
    await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
    await fs.promises.copyFile(this.resolve(relative), localPath);
  }

  async removeDir(relative: string) {
    await fs.promises.rm(this.resolve(relative), {
      recursive: true,
      force: true,
    });
  }
}

// rclone's exit codes for a missing directory or file.
const RCLONE_NOT_FOUND = new Set([3, 4]);
const RCLONE_TIMEOUT_MS = 5 * 60_000;

export class RcloneError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null
  ) {
    super(message);
  }
}

export class RcloneBackend implements SaveStoreBackend {
  constructor(
    private readonly remote: string,
    private readonly binary = "rclone"
  ) {}

  private target(relative: string) {
    const base = this.remote.trim();
    return base.endsWith(":") || base.endsWith("/")
      ? `${base}${relative}`
      : `${base}/${relative}`;
  }

  private run(args: string[], input?: string) {
    return new Promise<string>((resolve, reject) => {
      const child = execFile(
        this.binary,
        args,
        { timeout: RCLONE_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (!error) return resolve(stdout);
          const code =
            typeof (error as { code?: unknown }).code === "number"
              ? ((error as { code: number }).code as number)
              : null;
          reject(
            new RcloneError(
              stderr.trim().split("\n").pop() || error.message,
              code
            )
          );
        }
      );
      if (input !== undefined) child.stdin?.end(input);
    });
  }

  async readText(relative: string) {
    try {
      return await this.run(["cat", this.target(relative)]);
    } catch (error) {
      if (
        error instanceof RcloneError &&
        RCLONE_NOT_FOUND.has(error.exitCode ?? -1)
      )
        return null;
      throw error;
    }
  }

  async readTexts(relatives: string[]) {
    const texts = new Map<string, string>();
    if (relatives.length === 0) return texts;

    // One process for all files: rclone copies the listed paths to a temp folder.
    const temp = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "hydra-store-read-")
    );
    try {
      const listFile = path.join(temp, "files.txt");
      const destination = path.join(temp, "out");
      await fs.promises.writeFile(listFile, relatives.join("\n"));
      await this.run([
        "copy",
        this.target("").replace(/\/$/, "") || this.remote,
        destination,
        "--files-from-raw",
        listFile,
      ]);
      for (const relative of relatives) {
        try {
          texts.set(
            relative,
            await fs.promises.readFile(
              path.join(destination, ...relative.split("/")),
              "utf8"
            )
          );
        } catch (error) {
          if (!isMissing(error)) throw error;
        }
      }
    } finally {
      await fs.promises.rm(temp, { recursive: true, force: true });
    }
    return texts;
  }

  async writeText(relative: string, text: string) {
    await this.run(["rcat", this.target(relative)], text);
  }

  async list(
    relative: string,
    { recursive = false }: { recursive?: boolean } = {}
  ) {
    try {
      const output = await this.run([
        "lsjson",
        "--files-only",
        ...(recursive ? ["-R"] : []),
        this.target(relative),
      ]);
      const items = JSON.parse(output || "[]") as {
        Path: string;
        Size: number;
        ModTime: string;
      }[];
      return items.map((item) => ({
        path: item.Path,
        sizeBytes: item.Size,
        modifiedAt: Date.parse(item.ModTime) || 0,
      }));
    } catch (error) {
      if (
        error instanceof RcloneError &&
        RCLONE_NOT_FOUND.has(error.exitCode ?? -1)
      )
        return [];
      throw error;
    }
  }

  async removeFile(relative: string) {
    try {
      await this.run(["deletefile", this.target(relative)]);
    } catch (error) {
      if (
        error instanceof RcloneError &&
        RCLONE_NOT_FOUND.has(error.exitCode ?? -1)
      )
        return;
      throw error;
    }
  }

  async exists(relative: string) {
    try {
      await this.run(["lsjson", "--stat", this.target(relative)]);
      return true;
    } catch (error) {
      if (
        error instanceof RcloneError &&
        RCLONE_NOT_FOUND.has(error.exitCode ?? -1)
      )
        return false;
      throw error;
    }
  }

  async putFile(localPath: string, relative: string) {
    await this.run(["copyto", localPath, this.target(relative)]);
  }

  async getFile(relative: string, localPath: string) {
    await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
    await this.run(["copyto", this.target(relative), localPath]);
  }

  async removeDir(relative: string) {
    try {
      await this.run(["purge", this.target(relative)]);
    } catch (error) {
      if (
        error instanceof RcloneError &&
        RCLONE_NOT_FOUND.has(error.exitCode ?? -1)
      )
        return;
      throw error;
    }
  }
}

/** Whether rclone is installed, for the settings page. */
export const isRcloneAvailable = () =>
  new Promise<boolean>((resolve) => {
    const child = spawn("rclone", ["version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });

export const createSaveStoreBackend = (
  config: SaveStoreConfig
): SaveStoreBackend =>
  config.kind === "folder"
    ? new FolderBackend(config.path)
    : new RcloneBackend(config.remote);
