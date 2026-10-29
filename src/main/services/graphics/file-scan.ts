import fs from "node:fs";

const CHUNK_SIZE = 8 * 1024 * 1024;

/** Lower-cases ASCII letters in place, so patterns match whatever their case. */
const lowerCaseAscii = (buffer: Buffer) => {
  for (let index = 0; index < buffer.length; index++) {
    const byte = buffer[index];
    if (byte >= 0x41 && byte <= 0x5a) buffer[index] = byte + 0x20;
  }
  return buffer;
};

/**
 * Finds which of the patterns occur in the file, ignoring ASCII case, reading
 * at most `maxBytes` from the start. Patterns must be given in lower case.
 * Returns the indexes of the patterns found; stops early once all are.
 */
export const findPatternsInFile = async (
  filePath: string,
  patterns: Buffer[],
  maxBytes: number
): Promise<Set<number>> => {
  const found = new Set<number>();
  if (patterns.length === 0) return found;

  // A pattern split between two chunks is still found.
  const overlap = Math.max(...patterns.map((pattern) => pattern.length));
  const handle = await fs.promises.open(filePath, "r");

  try {
    const { size } = await handle.stat();
    const end = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(CHUNK_SIZE + overlap);
    let offset = 0;

    while (offset < end && found.size < patterns.length) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        Math.min(buffer.length, end - offset),
        offset
      );
      if (bytesRead === 0) break;

      const chunk = lowerCaseAscii(buffer.subarray(0, bytesRead));
      patterns.forEach((pattern, index) => {
        if (!found.has(index) && chunk.includes(pattern)) found.add(index);
      });

      if (offset + bytesRead >= end) break;
      offset += bytesRead - overlap;
    }
  } finally {
    await handle.close();
  }

  return found;
};
