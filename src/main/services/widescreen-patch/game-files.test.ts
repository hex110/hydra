import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  WIDESCREEN_MANIFEST_FILE,
  findMissingWidescreenFiles,
  findWidescreenConflict,
  installWidescreenPatch,
  planWidescreenFiles,
  readWidescreenManifest,
  uninstallWidescreenPatch,
} from "./game-files.ts";

let root: string;
let game: string;
let archive: string;

const write = (base: string, relativePath: string, content = relativePath) => {
  const target = path.join(base, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};
const has = (relativePath: string) =>
  fs.existsSync(path.join(game, relativePath));

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-widescreen-"));
  game = path.join(root, "game", "Mole", "Binaries", "Win64");
  archive = path.join(root, "archive");
  fs.mkdirSync(game, { recursive: true });
  write(archive, "CrimeBoss/Binaries/Win64/winmm.dll", "loader");
  write(archive, "CrimeBoss/Binaries/Win64/SUWSF.asi", "patch");
  write(archive, "CrimeBoss/Binaries/Win64/SUWSF.ini", "ini");
  write(archive, "EXTRACT TO GAME FOLDER", "note");
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("planWidescreenFiles", () => {
  it("takes what is under the archive folder, relative to it", async () => {
    const plan = await planWidescreenFiles(archive, "Binaries/Win64");
    assert.deepStrictEqual(plan.map((file) => file.target).sort(), [
      "SUWSF.asi",
      "SUWSF.ini",
      "winmm.dll",
    ]);
  });

  it("finds nothing in a zip without the folder", async () => {
    assert.deepStrictEqual(await planWidescreenFiles(archive, "Plugins"), []);
  });
});

describe("install and uninstall", () => {
  it("places the files and removes them again", async () => {
    const files = await planWidescreenFiles(archive, "Binaries/Win64");
    await installWidescreenPatch({
      patchId: "p",
      version: "1",
      installDirectory: game,
      files,
    });
    assert.ok(
      has("winmm.dll") && has("SUWSF.asi") && has(WIDESCREEN_MANIFEST_FILE)
    );
    assert.strictEqual((await readWidescreenManifest(game))?.files.length, 3);

    assert.strictEqual(await uninstallWidescreenPatch(game), true);
    assert.ok(
      !has("winmm.dll") && !has("SUWSF.asi") && !has(WIDESCREEN_MANIFEST_FILE)
    );
  });

  it("restores a file it replaced", async () => {
    write(game, "SUWSF.ini", "mine");
    await installWidescreenPatch({
      patchId: "p",
      version: "1",
      installDirectory: game,
      files: await planWidescreenFiles(archive, "Binaries/Win64"),
    });
    assert.strictEqual(
      fs.readFileSync(path.join(game, "SUWSF.ini"), "utf8"),
      "ini"
    );
    await uninstallWidescreenPatch(game);
    assert.strictEqual(
      fs.readFileSync(path.join(game, "SUWSF.ini"), "utf8"),
      "mine"
    );
    assert.ok(!has(".hydra-widescreen-patch-backup"));
  });

  it("leaves nothing behind when a file cannot be copied", async () => {
    await assert.rejects(
      installWidescreenPatch({
        patchId: "p",
        version: "1",
        installDirectory: game,
        files: [
          {
            source: path.join(archive, "CrimeBoss/Binaries/Win64/winmm.dll"),
            target: "winmm.dll",
          },
          { source: path.join(archive, "missing"), target: "SUWSF.asi" },
        ],
      })
    );
    assert.deepStrictEqual(fs.readdirSync(game), []);
  });

  it("refuses to touch files outside the game", async () => {
    write(
      game,
      WIDESCREEN_MANIFEST_FILE,
      JSON.stringify({ files: ["../evil"], directories: [], backups: [] })
    );
    write(root, "game/Mole/Binaries/evil", "keep");
    await assert.rejects(uninstallWidescreenPatch(game));
    assert.ok(fs.existsSync(path.join(root, "game/Mole/Binaries/evil")));
  });
});

describe("status checks", () => {
  it("reports a foreign file but not its own", async () => {
    assert.strictEqual(await findWidescreenConflict(game, "winmm.dll"), false);
    write(game, "winmm.dll", "someone else's");
    assert.strictEqual(await findWidescreenConflict(game, "winmm.dll"), true);
  });

  it("does not call its own file a conflict, and lists missing ones", async () => {
    await installWidescreenPatch({
      patchId: "p",
      version: "1",
      installDirectory: game,
      files: await planWidescreenFiles(archive, "Binaries/Win64"),
    });
    assert.strictEqual(await findWidescreenConflict(game, "winmm.dll"), false);
    fs.rmSync(path.join(game, "SUWSF.asi"));
    const manifest = (await readWidescreenManifest(game))!;
    assert.deepStrictEqual(await findMissingWidescreenFiles(game, manifest), [
      "SUWSF.asi",
    ]);
  });
});
