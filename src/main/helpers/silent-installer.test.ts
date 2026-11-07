import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { isInnoSetupInstaller } from "./silent-installer.ts";

let root: string;

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "hydra-silent-installer-"));
});

after(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const writeFile = async (name: string, content: Buffer) => {
  const filePath = path.join(root, name);
  await fs.writeFile(filePath, content);
  return filePath;
};

describe("isInnoSetupInstaller", () => {
  it("finds the marker in the loader at the start of the file", async () => {
    const filePath = await writeFile(
      "inno.exe",
      Buffer.concat([
        Buffer.alloc(70_000),
        Buffer.from("Inno Setup Setup Data (6.2.0)"),
        Buffer.alloc(2_000),
      ])
    );

    assert.equal(await isInnoSetupInstaller(filePath), true);
  });

  it("ignores a marker far past the scanned header", async () => {
    const filePath = await writeFile(
      "late.exe",
      Buffer.concat([
        Buffer.alloc(2 * 1024 * 1024),
        Buffer.from("Inno Setup Setup Data"),
      ])
    );

    assert.equal(await isInnoSetupInstaller(filePath), false);
  });

  it("is false for other installers and missing files", async () => {
    const filePath = await writeFile("nsis.exe", Buffer.from("Nullsoft"));

    assert.equal(await isInnoSetupInstaller(filePath), false);
    assert.equal(
      await isInnoSetupInstaller(path.join(root, "missing.exe")),
      false
    );
  });
});
