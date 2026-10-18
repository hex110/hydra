import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import {
  findHydraLauncherDataPath,
  getHydraLauncherPrefix,
  readHydraLauncherLibrary,
} from "./hydra-launcher.ts";

let root: string;
let dataPath: string;

const writeDatabase = async (
  preferences: object | null,
  games: Record<string, object>
) => {
  const db = new ClassicLevel<string, unknown>(
    path.join(dataPath, "hydra-db"),
    { valueEncoding: "json" }
  );
  if (preferences) await db.put("userPreferences", preferences);
  const sublevel = db.sublevel<string, object>("games", {
    valueEncoding: "json",
  });
  for (const [key, game] of Object.entries(games)) {
    await sublevel.put(key, game);
  }
  // Left open, as a running upstream Hydra would hold it.
  return db;
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-launcher-"));
  dataPath = path.join(root, "hydralauncher");
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("findHydraLauncherDataPath", () => {
  it("needs upstream's database", () => {
    assert.equal(findHydraLauncherDataPath(root), null);
    fs.mkdirSync(path.join(dataPath, "hydra-db"), { recursive: true });
    assert.equal(findHydraLauncherDataPath(root), dataPath);
  });
});

describe("readHydraLauncherLibrary", () => {
  it("reads prefixes while upstream holds the database", async () => {
    const db = await writeDatabase(null, {
      "steam:1": { shop: "steam", objectId: "1", winePrefixPath: "/p/one" },
      "steam:2": { shop: "steam", objectId: "2", winePrefixPath: null },
    });
    try {
      const snapshot = path.join(root, "snapshot");
      const library = await readHydraLauncherLibrary(dataPath, snapshot);

      assert.equal(
        getHydraLauncherPrefix(library, { shop: "steam", objectId: "1" }),
        "/p/one"
      );
      assert.equal(
        getHydraLauncherPrefix(library, { shop: "steam", objectId: "2" }),
        path.join(dataPath, "wine-prefixes", "2")
      );
      assert.equal(fs.existsSync(snapshot), false);
    } finally {
      await db.close();
    }
  });

  it("uses upstream's default prefix folder", async () => {
    const db = await writeDatabase(
      { defaultWinePrefixPath: "/games/prefixes" },
      {}
    );
    await db.close();

    const library = await readHydraLauncherLibrary(
      dataPath,
      path.join(root, "snapshot")
    );
    assert.equal(
      getHydraLauncherPrefix(library, { shop: "steam", objectId: "3" }),
      "/games/prefixes/3"
    );
  });
});
