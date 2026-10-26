import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { SaveStoreConfig } from "@types";

/**
 * The few file operations the save store needs, over a folder or an rclone
 * remote. Paths are relative, with forward slashes.
 */
export interface SaveStoreBackend {
  readText(relative: string): Promise<string | null>;
  /** Writes a small file; with `exclusive`, returns false when it exists. */
  writeText(
    relative: string,
    text: string,
    options?: { exclusive?: boolean }
  ): Promise<boolean>;
  exists(relative: string): Promise<boolean>;
  putFile(localPath: string, relative: string): Promise<void>;
  getFile(relative: string, localPath: string): Promise<void>;
  removeDir(relative: string): Promise<void>;
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

  async writeText(
    relative: string,
    text: string,
    { exclusive = false }: { exclusive?: boolean } = {}
  ) {
    const target = this.resolve(relative);
    const temp = await this.writeTemp(target, (file) =>
      fs.promises.writeFile(file, text, "utf8")
    );

    try {
      if (!exclusive) {
        await fs.promises.rename(temp, target);
        return true;
      }
      // A hard link fails when the target exists, unlike rename.
      await fs.promises.link(temp, target);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "EEXIST") return false;
      throw error;
    } finally {
      await fs.promises.rm(temp, { force: true });
    }
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

  async writeText(
    relative: string,
    text: string,
    { exclusive = false }: { exclusive?: boolean } = {}
  ) {
    // Remotes have no atomic create; a check first narrows the race to seconds.
    if (exclusive && (await this.exists(relative))) return false;
    await this.run(["rcat", this.target(relative)], text);
    return true;
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
