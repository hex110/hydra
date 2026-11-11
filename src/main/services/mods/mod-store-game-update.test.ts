import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

// mod-store is bundled with its services stubbed: a game record in memory,
// user data in a temporary folder, and the real deploy and update file code.
const STUBS: Record<string, string> = {
  "@main/level": `
    export const games = new Map();
    export const gamesSublevel = { get: async (key) => games.get(key) };
    export const levelKeys = { game: (shop, objectId) => shop + ":" + objectId };`,
  "../system-path": `
    export const SystemPath = { getPath: () => globalThis.__modsTestUserData };`,
  "./activity": `
    export const MAX_PLAN_FILES = 50;
    export const entries = [];
    export const ModActivity = { append: async (_shop, _id, entry) => { entries.push(entry); } };`,
  "../logger": `
    export const logger = { info() {}, warn() {}, error() {}, log() {} };`,
  "../game-running-state": `export const isTrackedGameKeyRunning = () => false;`,
  "../7zip": `export const SevenZip = {};`,
  "./fomod": `export const applyFomod = () => {}; export const readFomodConfig = () => null;`,
  "./games": `
    export const readRootEntries = async () => [];
    export const resolveGameSupportDefinition = async () => null;`,
  "./nexus": `
    export const getNexusLoaderEvidence = async () => null;
    export const getNexusModDescription = async () => null;`,
  "./placement-examples": `export const recordPlacementExample = async () => {};`,
  "../optiscaler/optiscaler": `export const OptiScaler = {};`,
  "../renodx/renodx": `export const RenoDx = {};`,
  electron: `export const app = {}; export const shell = {}; export default {};`,
};

type ModStoreModule = typeof import("./mod-store");
type UpdateFilesModule = typeof import("../game-updates/update-files");

let root: string;
let gameFolder: string;
let ModStore: ModStoreModule["ModStore"];
let mergeDirectoryInto: UpdateFilesModule["mergeDirectoryInto"];
let games: Map<string, unknown>;

const shop = "custom";
const objectId = "game";
const read = (...segments: string[]) =>
  fs.readFile(path.join(gameFolder, ...segments), "utf8");

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "hydra-mods-update-"));
  (globalThis as Record<string, unknown>).__modsTestUserData = path.join(
    root,
    "user-data"
  );
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = path.resolve(here, "../../..");
  const bundlePath = path.join(root, "bundle.mjs");

  await build({
    stdin: {
      contents: [
        'export { ModStore } from "./mod-store";',
        'export { mergeDirectoryInto } from "../game-updates/update-files";',
        'export { games } from "@main/level";',
      ].join("\n"),
      resolveDir: here,
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: bundlePath,
    logLevel: "silent",
    alias: {
      "@shared": path.join(src, "shared"),
      "@types": path.join(src, "types"),
      "@main": path.join(src, "main"),
    },
    plugins: [
      {
        name: "stubs",
        setup(pluginBuild) {
          const filter = new RegExp(
            `^(${Object.keys(STUBS)
              .map((name) => name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"))
              .join("|")})$`
          );
          pluginBuild.onResolve({ filter }, (args) => ({
            path: args.path,
            namespace: "stub",
          }));
          pluginBuild.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({
            contents: STUBS[args.path],
            loader: "js",
          }));
        },
      },
    ],
  });

  const loaded = await import(pathToFileURL(bundlePath).href);
  ModStore = loaded.ModStore;
  mergeDirectoryInto = loaded.mergeDirectoryInto;
  games = loaded.games;
});

after(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("mods and game updates", () => {
  it("updates the game's own files and puts the mods back over them", async () => {
    gameFolder = path.join(root, "Game");
    await fs.mkdir(path.join(gameFolder, "Data"), { recursive: true });
    await fs.writeFile(path.join(gameFolder, "Game.exe"), "exe v1");
    await fs.writeFile(path.join(gameFolder, "Data", "textures.pak"), "tex v1");
    await fs.writeFile(path.join(gameFolder, "Data", "sounds.pak"), "snd v1");
    games.set(`${shop}:${objectId}`, {
      title: "Game",
      shop,
      objectId,
      executablePath: path.join(gameFolder, "Game.exe"),
      installedVersion: { title: "Game v1" },
    });

    // A mod that replaces one of the game's files and adds one.
    const store = ModStore.storeFolder(shop, objectId);
    const staging = path.join(store, "staging", "hd");
    await fs.mkdir(path.join(staging, "Data"), { recursive: true });
    await fs.writeFile(path.join(staging, "Data", "textures.pak"), "tex HD");
    await fs.writeFile(path.join(staging, "Data", "hd.ini"), "hd config");
    await fs.writeFile(
      path.join(store, "mods.json"),
      JSON.stringify({
        mods: [
          {
            id: "hd",
            name: "HD Textures",
            version: "1.0",
            source: { kind: "file", fileName: "hd.zip" },
            enabled: false,
            deployRoot: "",
            files: ["Data/textures.pak", "Data/hd.ini"],
            installedAt: 0,
            gameVersion: "Game v1",
          },
        ],
        nexusGame: null,
      })
    );
    await ModStore.setEnabled(shop, objectId, "hd", true);
    assert.equal(await read("Data", "textures.pak"), "tex HD");

    // Extraction starts: the mods come out, so the comparison sees v1's file.
    await ModStore.takeOutBeforeGameFiles(shop, objectId, gameFolder);
    assert.equal(await read("Data", "textures.pak"), "tex v1");

    // The update changes textures.pak and the exe, not sounds.pak.
    const update = path.join(root, "update");
    await fs.mkdir(path.join(update, "Data"), { recursive: true });
    await fs.writeFile(path.join(update, "Game.exe"), "exe v2");
    await fs.writeFile(path.join(update, "Data", "textures.pak"), "tex v2");

    // A modded launch between extraction and install deployed them again.
    await ModStore.prepareLaunch(shop, objectId);
    assert.equal(await read("Data", "textures.pak"), "tex HD");

    games.set(`${shop}:${objectId}`, {
      ...(games.get(`${shop}:${objectId}`) as object),
      installedVersion: { title: "Game v2" },
    });
    await ModStore.applyGameUpdate(
      shop,
      objectId,
      { from: "Game v1", to: "Game v2" },
      () => mergeDirectoryInto(update, gameFolder)
    );

    assert.equal(await read("Game.exe"), "exe v2");
    assert.equal(await read("Data", "textures.pak"), "tex HD");
    assert.equal(await read("Data", "hd.ini"), "hd config");
    assert.equal(
      await fs.readFile(path.join(staging, "Data", "textures.pak"), "utf8"),
      "tex HD",
      "the staged mod is untouched"
    );

    const state = await ModStore.readState(shop, objectId);
    assert.deepEqual(
      { ...state.mods[0].gameUpdatedSince, at: undefined },
      { from: "Game v1", to: "Game v2", at: undefined }
    );

    // Turning the mod off restores the updated file, not the old one.
    await ModStore.setEnabled(shop, objectId, "hd", false);
    assert.equal(await read("Data", "textures.pak"), "tex v2");
    assert.equal(await read("Data", "sounds.pak"), "snd v1");
    await assert.rejects(read("Data", "hd.ini"));
  });

  it("keeps a file something else replaced, and deploys again over it", async () => {
    // State from the test above: the mod is off and the game is at v2.
    await ModStore.setEnabled(shop, objectId, "hd", true);
    assert.equal(await read("Data", "textures.pak"), "tex HD");

    // A launcher's update writes a new file over the mod's hard link.
    const target = path.join(gameFolder, "Data", "textures.pak");
    await fs.rm(target);
    await fs.writeFile(target, "tex v3");

    // A modded launch notices and puts the mod back over the new file.
    await ModStore.prepareLaunch(shop, objectId);
    assert.equal(await read("Data", "textures.pak"), "tex HD");

    // Turning the mod off restores v3, not the v2 backed up before it.
    await ModStore.setEnabled(shop, objectId, "hd", false);
    assert.equal(await read("Data", "textures.pak"), "tex v3");

    // Replaced while the mod is off then on: undeploy keeps the new file.
    await ModStore.setEnabled(shop, objectId, "hd", true);
    await fs.rm(target);
    await fs.writeFile(target, "tex v4");
    await ModStore.setEnabled(shop, objectId, "hd", false);
    assert.equal(await read("Data", "textures.pak"), "tex v4");
    assert.equal(
      await fs.readFile(
        path.join(
          ModStore.storeFolder(shop, objectId),
          "staging",
          "hd",
          "Data",
          "textures.pak"
        ),
        "utf8"
      ),
      "tex HD"
    );
  });
});
