import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const readJson = async <T>(filePath: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.promises.readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
};

export const writeJson = async (filePath: string, value: unknown) => {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await fs.promises.writeFile(temporaryPath, JSON.stringify(value));
  await fs.promises.rename(temporaryPath, filePath);
};

export const listDirectories = async (directory: string) =>
  (
    await fs.promises
      .readdir(directory, { withFileTypes: true })
      .catch(() => [] as fs.Dirent[])
  )
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name);

export const getDirectorySize = async (directory: string): Promise<number> => {
  const entries = await fs.promises
    .readdir(directory, { withFileTypes: true })
    .catch(() => [] as fs.Dirent[]);
  let size = 0;
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) size += await getDirectorySize(entryPath);
    else
      size += (await fs.promises.stat(entryPath).catch(() => null))?.size ?? 0;
  }
  return size;
};
