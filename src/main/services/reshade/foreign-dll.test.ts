import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findExistingProxyDlls, identifyProxyDll } from "./foreign-dll.ts";

let directory: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-foreign-dll-"));
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

const write = (name: string, content: Buffer | string) => {
  const filePath = path.join(directory, name);
  fs.writeFileSync(filePath, content);
  return filePath;
};

const utf16 = (text: string) => Buffer.from(text, "utf16le");

describe("identifyProxyDll", () => {
  it("recognises ReShade by its author string, in either encoding", async () => {
    assert.strictEqual(
      await identifyProxyDll(write("a.dll", "MZ ReShade by crosire")),
      "reshade"
    );
    assert.strictEqual(
      await identifyProxyDll(write("b.dll", utf16("Copyright crosire"))),
      "reshade"
    );
  });

  it("names OptiScaler even though it mentions ReShade, DXVK and Special K", async () => {
    const file = write(
      "c.dll",
      "OptiScaler LoadReshade crosire DXVK SpecialK ENBSeries"
    );
    assert.strictEqual(await identifyProxyDll(file), "optiscaler");
  });

  it("recognises DXVK, Special K and ENB", async () => {
    assert.strictEqual(
      await identifyProxyDll(write("d.dll", "DXVK 2.7")),
      "dxvk"
    );
    assert.strictEqual(
      await identifyProxyDll(write("e.dll", utf16("SpecialK64"))),
      "special-k"
    );
    assert.strictEqual(
      await identifyProxyDll(write("f.dll", "ENBSeries")),
      "enb"
    );
  });

  it("calls anything else unknown", async () => {
    assert.strictEqual(
      await identifyProxyDll(write("g.dll", "just a library")),
      "unknown"
    );
  });
});

describe("findExistingProxyDlls", () => {
  it("reports files using a candidate name, whatever its case", async () => {
    write("DXGI.dll", "DXVK");
    write("d3d9.dll", "other");
    write("readme.txt", "dxgi");

    const existing = await findExistingProxyDlls(directory, ["dxgi.dll"]);
    assert.deepStrictEqual(existing, [{ fileName: "DXGI.dll", kind: "dxvk" }]);
  });

  it("leaves out files Hydra wrote", async () => {
    write("dxgi.dll", "crosire");
    const existing = await findExistingProxyDlls(
      directory,
      ["dxgi.dll"],
      new Set(["DXGI.DLL"])
    );
    assert.deepStrictEqual(existing, []);
  });
});
