import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { appendDirectoryToPath } from "../../../../shared/bundled-commands.js";
import { SevenZip } from "../../7zip";
import { logger } from "../../logger";
import { SystemPath } from "../../system-path";
import {
  R2_REMOTE_NAME,
  findChecksum,
  parseRcloneVersion,
  r2RemoteArguments,
  rcloneArch,
} from "./rclone-setup-core";
import type { R2Credentials } from "@types";

const run = promisify(execFile);
const DOWNLOADS = "https://downloads.rclone.org";

/** Where Hydra keeps programs it downloads for the user, such as rclone. */
export const getHydraBinPath = () =>
  path.join(SystemPath.getPath("userData"), "bin");

/** An rclone Hydra downloaded runs by name; an installed one still wins. */
export const addHydraBinToPath = () => {
  process.env.PATH = appendDirectoryToPath(process.env.PATH, getHydraBinPath());
};

const fetchText = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.text();
};

/**
 * Downloads the official rclone build into Hydra's bin folder, checked
 * against the SHA-256 rclone publishes.
 */
export const installRclone = async () => {
  if (process.platform !== "linux") throw new Error("rclone_linux_only");
  const arch = rcloneArch(process.arch);
  if (!arch) throw new Error("rclone_unsupported_cpu");

  const version = parseRcloneVersion(
    await fetchText(`${DOWNLOADS}/version.txt`)
  );
  if (!version) throw new Error("rclone_version_unknown");
  const name = `rclone-${version}-linux-${arch}`;
  const expected = findChecksum(
    await fetchText(`${DOWNLOADS}/${version}/SHA256SUMS`),
    `${name}.zip`
  );
  if (!expected) throw new Error("rclone_checksum_missing");

  const response = await fetch(`${DOWNLOADS}/${version}/${name}.zip`);
  if (!response.ok) throw new Error(`rclone download: ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  const actual = crypto.createHash("sha256").update(archive).digest("hex");
  if (actual !== expected) throw new Error("rclone_checksum_mismatch");

  const work = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "hydra-rclone-")
  );
  try {
    const zipPath = path.join(work, `${name}.zip`);
    await fs.promises.writeFile(zipPath, archive);
    await SevenZip.extractFile({ filePath: zipPath, outputPath: work });
    const binDirectory = getHydraBinPath();
    await fs.promises.mkdir(binDirectory, { recursive: true });
    const target = path.join(binDirectory, "rclone");
    await fs.promises.copyFile(path.join(work, name, "rclone"), target);
    await fs.promises.chmod(target, 0o755);
    addHydraBinToPath();
    logger.info("Installed rclone", { version, target });
    return version;
  } finally {
    await fs.promises.rm(work, { recursive: true, force: true });
  }
};

/**
 * Adds (or updates) the `hydra-r2` remote in the user's own rclone config.
 * The keys live in rclone.conf, as with a remote made by hand; Hydra keeps
 * only the remote's name.
 */
export const createR2Remote = async (
  credentials: R2Credentials
): Promise<string> => {
  const settings = r2RemoteArguments(credentials);
  const { stdout } = await run("rclone", ["listremotes"]);
  const exists = stdout
    .split("\n")
    .some((line) => line.trim() === `${R2_REMOTE_NAME}:`);
  await run("rclone", [
    "config",
    exists ? "update" : "create",
    R2_REMOTE_NAME,
    ...(exists ? [] : ["s3"]),
    ...settings,
    "--non-interactive",
  ]);
  return R2_REMOTE_NAME;
};
