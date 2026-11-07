import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  getCompletedDownloadState as resolveState,
  resolveDownloadFolder,
} from "./download-game-folder.js";

/** Stands in for `findGameInstaller`, which has its own tests. */
const findSetup = async (folderPath: string) => {
  const setup = path.join(folderPath, "setup.exe");
  return fs.existsSync(setup) ? setup : null;
};

const getCompletedDownloadState = (
  download: Parameters<typeof resolveState>[0],
  game: Parameters<typeof resolveState>[1],
  platform?: NodeJS.Platform
) => resolveState(download, game, findSetup, platform);

let root: string;

const touch = (...segments: string[]) => {
  const target = path.join(root, ...segments);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, "x");
};

const download = (
  folderName: string,
  extra: { extracting?: boolean; extractionFailed?: boolean } = {}
) => ({
  downloadPath: root,
  folderName,
  extracting: false,
  ...extra,
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-download-folder-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("getCompletedDownloadState", () => {
  it("offers Play once the game has an executable, whatever the folder holds", async () => {
    touch("Game", "Game.exe");

    assert.equal(
      await getCompletedDownloadState(download("Game"), {
        executablePath: "/g.exe",
      }),
      "play"
    );
  });

  it("offers Extract for an archive nobody unpacked", async () => {
    touch("Game.zip");

    assert.equal(
      await getCompletedDownloadState(download("Game.zip"), {}),
      "extract"
    );
  });

  it("offers Install when the unpacked folder has setup.exe", async () => {
    touch("Game", "setup.exe");
    touch("Game", "data.bin");

    assert.equal(
      await getCompletedDownloadState(download("Game"), {}),
      "install"
    );
  });

  it("offers Open folder when nothing in the folder is an installer", async () => {
    touch("Game", "bin", "Game.exe");

    assert.equal(
      await getCompletedDownloadState(download("Game"), {}),
      "open-folder"
    );
  });

  it("never offers Install on macOS", async () => {
    touch("Game", "setup.exe");

    assert.equal(
      await getCompletedDownloadState(download("Game"), {}, "darwin"),
      "open-folder"
    );
  });

  it("reports files that are gone", async () => {
    assert.equal(
      await getCompletedDownloadState(download("Gone.zip"), {}),
      "missing"
    );
  });
});

describe("resolveDownloadFolder", () => {
  it("finds a folder unpacked by hand next to the archive", async () => {
    touch("Game.zip");
    touch("Game", "setup.exe");

    const folder = resolveDownloadFolder(download("Game.zip"));

    assert.equal(folder.kind, "folder");
    assert.equal(folder.kind === "folder" && folder.extractedOutside, true);
    assert.equal(
      await getCompletedDownloadState(download("Game.zip"), {}),
      "install"
    );
  });

  it("finds a folder unpacked by hand after the archive was deleted", async () => {
    touch("Game", "setup.exe");

    assert.equal(
      await getCompletedDownloadState(download("Game.zip"), {}),
      "install"
    );
  });

  it("does not trust a folder left by a failed extraction", async () => {
    touch("Game.zip");
    touch("Game", "setup.exe");

    assert.equal(
      await getCompletedDownloadState(
        download("Game.zip", { extractionFailed: true }),
        {}
      ),
      "extract"
    );
  });

  it("ignores an empty folder next to the archive", () => {
    touch("Game.zip");
    fs.mkdirSync(path.join(root, "Game"));

    assert.equal(resolveDownloadFolder(download("Game.zip")).kind, "archive");
  });
});
