import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readPeFile } from "./pe-file.ts";
import { buildTestPe } from "./test-pe.ts";

let directory: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-pe-"));
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

const write = (name: string, content: Buffer | string) => {
  const filePath = path.join(directory, name);
  fs.writeFileSync(filePath, content);
  return filePath;
};

describe("readPeFile", () => {
  it("reads the architecture and the import tables of a 64-bit file", async () => {
    const file = write(
      "a.exe",
      buildTestPe({
        machine: "x64",
        imports: ["KERNEL32.dll", "dxgi.dll"],
        delayImports: ["D3D12.dll"],
      })
    );
    assert.deepStrictEqual(await readPeFile(file), {
      architecture: "x64",
      imports: ["kernel32.dll", "dxgi.dll"],
      delayImports: ["d3d12.dll"],
    });
  });

  it("reads a 32-bit file", async () => {
    const file = write(
      "b.exe",
      buildTestPe({ machine: "x86", imports: ["d3d9.dll"] })
    );
    assert.deepStrictEqual(await readPeFile(file), {
      architecture: "x86",
      imports: ["d3d9.dll"],
      delayImports: [],
    });
  });

  it("reads a file without imports", async () => {
    const file = write("c.exe", buildTestPe({ machine: "arm64" }));
    assert.deepStrictEqual(await readPeFile(file), {
      architecture: "arm64",
      imports: [],
      delayImports: [],
    });
  });

  it("returns null for files that are not PE files", async () => {
    assert.strictEqual(await readPeFile(write("d.exe", "hello")), null);
    assert.strictEqual(await readPeFile(write("e.exe", "")), null);
    const broken = buildTestPe({ imports: ["a.dll"] });
    broken.writeUInt32LE(0xffffff, 0x3c);
    assert.strictEqual(await readPeFile(write("f.exe", broken)), null);
  });

  it("copes with a truncated file", async () => {
    const full = buildTestPe({ imports: ["a.dll", "b.dll"] });
    const info = await readPeFile(write("g.exe", full.subarray(0, 0x410)));
    assert.strictEqual(info?.architecture, "x64");
  });
});
