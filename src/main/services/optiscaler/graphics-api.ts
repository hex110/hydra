import fs from "node:fs";
import path from "node:path";

const CHUNK_SIZE = 8 * 1024 * 1024;
const MAX_SCANNED_BYTES = 512 * 1024 * 1024;
const MAX_EXECUTABLES = 4;

const VULKAN_LOADER = Buffer.from("vulkan-1.dll");
const DIRECT3D_LOADERS = [
  "d3d9.dll",
  "d3d10.dll",
  "d3d11.dll",
  "d3d12.dll",
].map((name) => Buffer.from(name));
/** Longest name above, so a name split between two chunks is still found. */
const OVERLAP = 16;

export interface GraphicsApis {
  vulkan: boolean;
  direct3d: boolean;
}

/** Lower-cases ASCII letters in place, so names match whatever their case. */
const lowerCaseAscii = (buffer: Buffer) => {
  for (let index = 0; index < buffer.length; index++) {
    const byte = buffer[index];
    if (byte >= 0x41 && byte <= 0x5a) buffer[index] = byte + 0x20;
  }
  return buffer;
};

/**
 * Looks for the DLL names a game's executable loads its graphics API
 * through: `vulkan-1.dll`, `d3d9.dll` to `d3d12.dll`. Names inside the file
 * cover the import table and libraries loaded by name at run time.
 */
export const detectGraphicsApisInFile = async (
  filePath: string
): Promise<GraphicsApis> => {
  const apis: GraphicsApis = { vulkan: false, direct3d: false };
  const handle = await fs.promises.open(filePath, "r");

  try {
    const { size } = await handle.stat();
    const end = Math.min(size, MAX_SCANNED_BYTES);
    const buffer = Buffer.alloc(CHUNK_SIZE + OVERLAP);
    let offset = 0;

    while (offset < end && !(apis.vulkan && apis.direct3d)) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        Math.min(buffer.length, end - offset),
        offset
      );
      if (bytesRead === 0) break;

      const chunk = lowerCaseAscii(buffer.subarray(0, bytesRead));
      apis.vulkan ||= chunk.includes(VULKAN_LOADER);
      apis.direct3d ||= DIRECT3D_LOADERS.some((name) => chunk.includes(name));

      if (offset + bytesRead >= end) break;
      offset += bytesRead - OVERLAP;
    }
  } finally {
    await handle.close();
  }

  return apis;
};

/**
 * The graphics APIs a game uses, from its executable and the other
 * executables beside it (the real one sits behind a bootstrap executable in
 * some games). Null when nothing could be read.
 */
const detected = new Map<string, GraphicsApis | null>();

export const detectGraphicsApis = async (
  executablePath: string
): Promise<GraphicsApis | null> => {
  // Scanning a large executable takes a moment; the options page asks often.
  const stat = await fs.promises.stat(executablePath).catch(() => null);
  const key = stat
    ? `${executablePath}:${stat.size}:${stat.mtimeMs}`
    : executablePath;
  if (detected.has(key)) return detected.get(key) ?? null;

  const apis = await scanExecutables(executablePath);
  detected.set(key, apis);
  return apis;
};

const scanExecutables = async (
  executablePath: string
): Promise<GraphicsApis | null> => {
  const directory = path.dirname(executablePath);
  const siblings = await fs.promises
    .readdir(directory, { withFileTypes: true })
    .catch(() => [] as fs.Dirent[]);

  const candidates = new Map<string, number>();
  for (const entry of siblings) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".exe") {
      continue;
    }
    const filePath = path.join(directory, entry.name);
    const stat = await fs.promises.stat(filePath).catch(() => null);
    if (stat) candidates.set(filePath, stat.size);
  }

  const files = [
    executablePath,
    ...[...candidates]
      .filter(([filePath]) => filePath !== executablePath)
      .sort((a, b) => b[1] - a[1])
      .map(([filePath]) => filePath),
  ].slice(0, MAX_EXECUTABLES);

  const combined: GraphicsApis = { vulkan: false, direct3d: false };
  let scanned = 0;

  for (const filePath of files) {
    try {
      const apis = await detectGraphicsApisInFile(filePath);
      combined.vulkan ||= apis.vulkan;
      combined.direct3d ||= apis.direct3d;
      scanned++;
    } catch {
      // An unreadable executable says nothing about the game.
    }
  }

  return scanned > 0 ? combined : null;
};
