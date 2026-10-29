import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  detectGameGraphics,
  detectGraphicsApis,
  detectGraphicsApisInFile,
} from "./graphics-api.ts";
import { buildTestPe } from "./test-pe.ts";

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

describe("detectGameGraphics", () => {
  it("reads the architecture and the API from the import table", async () => {
    const exe = write(
      "dx11.exe",
      buildTestPe({ machine: "x86", imports: ["KERNEL32.dll", "d3d11.dll"] })
    );
    assert.deepStrictEqual(await detectGameGraphics(exe), {
      architecture: "x86",
      apis: { vulkan: false, direct3d9: false, dxgi: true, opengl: false },
    });
  });

  it("treats delay-loaded libraries like imported ones", async () => {
    const exe = write(
      "delay.exe",
      buildTestPe({ imports: ["kernel32.dll"], delayImports: ["d3d9.dll"] })
    );
    assert.strictEqual((await detectGameGraphics(exe))?.apis.direct3d9, true);
  });

  it("trusts the imports over a name that merely appears in the file", async () => {
    const exe = write(
      "vulkan.exe",
      buildTestPe({ imports: ["vulkan-1.dll"] }),
      "d3d11.dll\0"
    );
    assert.deepStrictEqual((await detectGameGraphics(exe))?.apis, {
      vulkan: true,
      direct3d9: false,
      dxgi: false,
      opengl: false,
    });
  });

  it("falls back to names in the file when the imports name no API", async () => {
    const exe = write(
      "dynamic.exe",
      buildTestPe({ imports: ["kernel32.dll"] }),
      "\0d3d12.dll\0opengl32.dll\0"
    );
    const apis = (await detectGameGraphics(exe))?.apis;
    assert.strictEqual(apis?.dxgi, true);
    assert.strictEqual(apis?.opengl, true);
  });

  it("reads UnityPlayer.dll, where Unity games load their API", async () => {
    const exe = write("unity.exe", buildTestPe({ imports: ["kernel32.dll"] }));
    write("UnityPlayer.dll", buildTestPe({ imports: ["d3d11.dll"] }));
    assert.strictEqual((await detectGameGraphics(exe))?.apis.dxgi, true);
  });

  it("takes the architecture from the game's own executable", async () => {
    const exe = write("main.exe", buildTestPe({ machine: "x64" }));
    write("other.exe", buildTestPe({ machine: "x86" }));
    assert.strictEqual((await detectGameGraphics(exe))?.architecture, "x64");
  });
});
