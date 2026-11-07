import fs from "node:fs";

// Inno Setup's loader carries this marker in its resources, near the start of
// the file; GOG offline installers and most repack installers are Inno Setup.
const INNO_SETUP_MARKER = Buffer.from("Inno Setup Setup Data");
const HEADER_BYTES_TO_SCAN = 1024 * 1024;

// No /DIR: the installer's own default folder (C:\GOG Games\<title> for GOG)
// is where the library scan looks for the result.
export const INNO_SILENT_ARGS = [
  "/VERYSILENT",
  "/SUPPRESSMSGBOXES",
  "/NORESTART",
  "/SP-",
];

export const isInnoSetupInstaller = async (filePath: string) => {
  let handle: fs.promises.FileHandle | null = null;

  try {
    handle = await fs.promises.open(filePath, "r");
    const buffer = Buffer.alloc(HEADER_BYTES_TO_SCAN);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);

    return buffer.subarray(0, bytesRead).includes(INNO_SETUP_MARKER);
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => {});
  }
};
