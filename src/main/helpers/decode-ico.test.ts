import { describe, it } from "node:test";
import assert from "node:assert";
import { decodeLargestIcoImage } from "./decode-ico.ts";

const icoWith = (images: { size: number; data: Buffer }[]) => {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = header.length;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });

  return Buffer.concat([header, ...images.map(({ data }) => data)]);
};

/** A 2x1 32-bit bitmap: a red pixel then a half-transparent blue one. */
const bitmap = () => {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(2, 4);
  header.writeInt32LE(2, 8);
  header.writeUInt16LE(32, 14);
  const pixels = Buffer.from([0, 0, 255, 255, 255, 0, 0, 128]);
  return Buffer.concat([header, pixels, Buffer.alloc(4)]);
};

describe("decodeLargestIcoImage", () => {
  it("returns the largest entry when it is a PNG", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const decoded = decodeLargestIcoImage(
      icoWith([
        { size: 16, data: bitmap() },
        { size: 256, data: png },
      ])
    );

    assert.deepStrictEqual(decoded, { type: "png", data: png });
  });

  it("converts a 32-bit bitmap to RGBA", () => {
    const decoded = decodeLargestIcoImage(
      icoWith([{ size: 2, data: bitmap() }])
    );

    assert.deepStrictEqual(decoded, {
      type: "rgba",
      data: Buffer.from([255, 0, 0, 255, 0, 0, 255, 128]),
      width: 2,
      height: 1,
    });
  });

  it("takes transparency from the mask of a 24-bit bitmap", () => {
    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0);
    header.writeInt32LE(2, 4);
    header.writeInt32LE(2, 8);
    header.writeUInt16LE(24, 14);
    // One padded pixel row (green, white), then a mask hiding the second pixel.
    const pixels = Buffer.from([0, 255, 0, 255, 255, 255, 0, 0]);
    const mask = Buffer.from([0b01000000, 0, 0, 0]);

    const decoded = decodeLargestIcoImage(
      icoWith([{ size: 2, data: Buffer.concat([header, pixels, mask]) }])
    );

    assert.deepStrictEqual(decoded, {
      type: "rgba",
      data: Buffer.from([0, 255, 0, 255, 255, 255, 255, 0]),
      width: 2,
      height: 1,
    });
  });

  it("rejects files that are not icons", () => {
    assert.strictEqual(decodeLargestIcoImage(Buffer.from("not an icon")), null);
  });
});
