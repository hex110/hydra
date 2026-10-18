const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

export type IcoImage =
  | { type: "png"; data: Buffer }
  | { type: "rgba"; data: Buffer; width: number; height: number };

/** A 24- or 32-bit icon bitmap as RGBA, or null for other depths. */
const decodeBitmap = (image: Buffer): IcoImage | null => {
  if (image.length < 40) return null;

  const headerSize = image.readUInt32LE(0);
  const width = image.readInt32LE(4);
  // The height covers the colour bitmap and the AND mask stacked together.
  const height = Math.abs(image.readInt32LE(8)) / 2;
  const bitCount = image.readUInt16LE(14);

  if ((bitCount !== 24 && bitCount !== 32) || width <= 0 || height <= 0) {
    return null;
  }

  const bytesPerPixel = bitCount / 8;
  // Bitmap rows, and the 1-bit mask rows after them, are padded to 4 bytes.
  const rowLength = Math.ceil((width * bytesPerPixel) / 4) * 4;
  const maskRowLength = Math.ceil(width / 32) * 4;
  const maskStart = headerSize + rowLength * height;
  const hasMask = maskStart + maskRowLength * height <= image.length;

  if (maskStart > image.length) return null;

  const rgba = Buffer.alloc(width * height * 4);
  let hasAlpha = false;

  // Rows are stored bottom-up, in BGR(A) order.
  for (let y = 0; y < height; y++) {
    const source = headerSize + (height - 1 - y) * rowLength;
    for (let x = 0; x < width; x++) {
      const from = source + x * bytesPerPixel;
      const to = (y * width + x) * 4;
      rgba[to] = image[from + 2];
      rgba[to + 1] = image[from + 1];
      rgba[to + 2] = image[from];
      rgba[to + 3] = bytesPerPixel === 4 ? image[from + 3] : 255;
      if (bytesPerPixel === 4 && image[from + 3] > 0) hasAlpha = true;
    }
  }

  // Without an alpha channel, the AND mask marks the transparent pixels.
  if (!hasAlpha && hasMask) {
    for (let y = 0; y < height; y++) {
      const source = maskStart + (height - 1 - y) * maskRowLength;
      for (let x = 0; x < width; x++) {
        const transparent = (image[source + (x >> 3)] >> (7 - (x & 7))) & 1;
        rgba[(y * width + x) * 4 + 3] = transparent ? 0 : 255;
      }
    }
  }

  return { type: "rgba", data: rgba, width, height };
};

/**
 * Extracts the largest image of an ICO file, which sharp cannot read. Handles
 * PNG entries and 24- or 32-bit bitmaps; returns null when none is usable.
 */
export const decodeLargestIcoImage = (buffer: Buffer): IcoImage | null => {
  if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0) return null;
  if (buffer.readUInt16LE(2) !== 1) return null;

  const count = buffer.readUInt16LE(4);
  const entries: { size: number; bitCount: number; image: Buffer }[] = [];

  for (let index = 0; index < count; index++) {
    const entry = 6 + index * 16;
    if (entry + 16 > buffer.length) return null;

    const length = buffer.readUInt32LE(entry + 8);
    const offset = buffer.readUInt32LE(entry + 12);
    if (offset + length > buffer.length) continue;

    entries.push({
      size: buffer.readUInt8(entry) || 256,
      bitCount: buffer.readUInt16LE(entry + 6),
      image: buffer.subarray(offset, offset + length),
    });
  }

  // Largest first, and the deepest colour among images of one size.
  entries.sort((a, b) => b.size - a.size || b.bitCount - a.bitCount);

  for (const { image } of entries) {
    if (image.subarray(0, 4).equals(PNG_SIGNATURE)) {
      return { type: "png", data: image };
    }

    const bitmap = decodeBitmap(image);
    if (bitmap) return bitmap;
  }

  return null;
};
