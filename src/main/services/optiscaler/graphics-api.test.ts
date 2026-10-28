import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  detectGraphicsApis,
  detectGraphicsApisInFile,
} from "./graphics-api.ts";

let directory: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-graphics-api-"));
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

const write = (name: string, ...parts: (string | Buffer)[]) => {
  const filePath = path.join(directory, name);
  fs.writeFileSync(filePath, Buffer.concat(parts.map((p) => Buffer.from(p))));
  return filePath;
};

describe("detectGraphicsApisInFile", () => {
  it("finds a Vulkan loader name, whatever its case", async () => {
    const file = write("a.exe", "MZ\0\0", "VULKAN-1.DLL", "\0\0");
    assert.deepStrictEqual(await detectGraphicsApisInFile(file), {
      vulkan: true,
      direct3d: false,
    });
  });

  it("finds a Direct3D loader name", async () => {
    const file = write("a.exe", "MZ", "\0d3d12.dll\0");
    assert.deepStrictEqual(await detectGraphicsApisInFile(file), {
      vulkan: false,
      direct3d: true,
    });
  });

  it("finds both, and neither", async () => {
    assert.deepStrictEqual(
      await detectGraphicsApisInFile(write("b.exe", "vulkan-1.dll d3d11.dll")),
      { vulkan: true, direct3d: true }
    );
    assert.deepStrictEqual(
      await detectGraphicsApisInFile(write("c.exe", "kernel32.dll")),
      { vulkan: false, direct3d: false }
    );
  });

  it("finds a name that straddles two read chunks", async () => {
    const chunk = 8 * 1024 * 1024;
    const file = write(
      "big.exe",
      Buffer.alloc(chunk - 5, 0x41),
      "vulkan-1.dll",
      Buffer.alloc(100, 0x41)
    );
    assert.strictEqual((await detectGraphicsApisInFile(file)).vulkan, true);
  });
});

describe("detectGraphicsApis", () => {
  it("also reads the other executables beside the game's", async () => {
    const launcher = write("game.exe", "kernel32.dll");
    write("game-shipping.exe", "vulkan-1.dll");
    assert.deepStrictEqual(await detectGraphicsApis(launcher), {
      vulkan: true,
      direct3d: false,
    });
  });

  it("is null when the executable cannot be read", async () => {
    assert.strictEqual(
      await detectGraphicsApis(path.join(directory, "missing.exe")),
      null
    );
  });
});
