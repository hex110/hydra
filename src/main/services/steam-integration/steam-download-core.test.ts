import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  computeSteamDownloadBytes,
  describeSteamDownloadStatus,
  listUnfinishedSteamInstallDirectories,
  measureFolderBytes,
  parseSteamContentLog,
  parseSteamManifestDownload,
} from "./steam-download-core.ts";

const manifest = (values: Record<string, string>) =>
  `"AppState"\n{\n${Object.entries(values)
    .map(([key, value]) => `\t"${key}"\t\t"${value}"`)
    .join("\n")}\n}`;

// Lines as Steam writes them, from a real Cataclismo install.
const LOG = `[2026-11-06 15:05:35] AppID 1422440 state changed : Update Required,Update Queued,
[2026-11-06 15:05:37] AppID 1422440 update started : download 0/2411841504, store 0/0, reuse 0/0, delta 0/0, stage 0/7982923337
[2026-11-06 15:05:37] AppID 1422440 state changed : Update Required,Update Queued,Update Running,Update Started,
[2026-11-06 15:05:37] AppID 1422440 App update changed : Running Update,Downloading,Staging,
[2026-11-06 15:05:38] AppID 228980 state changed : Update Required,Fully Installed,Update Started, (Suspended) (Update delayed for 39226 secs)`;

test("a manifest Steam has just been asked to install is installing", () => {
  const parsed = parseSteamManifestDownload(
    manifest({ appid: "7", StateFlags: "1026", installdir: "Game" })
  );
  assert.equal(parsed?.installing, true);
  assert.equal(parsed?.installed, false);
  assert.equal(parsed?.installDirectoryName, "Game");
});

test("an installed manifest, even one with an update pending, is not installing", () => {
  const parsed = parseSteamManifestDownload(
    manifest({ appid: "7", StateFlags: "6" })
  );
  assert.equal(parsed?.installed, true);
  assert.equal(parsed?.installing, false);
});

test("the content log gives each app's latest state and totals", () => {
  const apps = parseSteamContentLog(LOG, new Set(["1422440", "228980"]));
  const game = apps.get("1422440");

  assert.deepEqual(game?.state, [
    "Update Required",
    "Update Queued",
    "Update Running",
    "Update Started",
  ]);
  assert.deepEqual(game?.update, ["Running Update", "Downloading", "Staging"]);
  assert.deepEqual(game?.totals, { download: 2411841504, stage: 7982923337 });
  assert.equal(apps.get("228980")?.suspended, true);
});

test("the status follows the log, and growing files mean downloading", () => {
  const apps = parseSteamContentLog(LOG, new Set(["1422440", "228980"]));

  assert.equal(
    describeSteamDownloadStatus(apps.get("1422440"), false),
    "downloading"
  );
  assert.equal(
    describeSteamDownloadStatus(apps.get("228980"), false),
    "paused"
  );
  assert.equal(
    describeSteamDownloadStatus(
      {
        state: ["Update Required", "Update Queued"],
        update: null,
        suspended: false,
        totals: null,
      },
      false
    ),
    "queued"
  );
  assert.equal(
    describeSteamDownloadStatus(
      {
        state: ["Fully Installed", "Update Running"],
        update: ["Running Update", "Committing"],
        suspended: false,
        totals: null,
      },
      false
    ),
    "finishing"
  );
  assert.equal(describeSteamDownloadStatus(undefined, true), "downloading");
});

test("progress uses the staging folder over the manifest's stale counts", () => {
  const parsed = parseSteamManifestDownload(
    manifest({
      appid: "7",
      StateFlags: "1026",
      BytesToDownload: "500",
      BytesDownloaded: "10",
      BytesToStage: "1000",
      BytesStaged: "20",
    })
  )!;

  assert.deepEqual(computeSteamDownloadBytes(parsed, undefined, 400), {
    done: 400,
    total: 1000,
  });
  assert.deepEqual(computeSteamDownloadBytes(parsed, undefined, null), {
    done: 20,
    total: 1000,
  });
});

test("progress takes its total from the log before the manifest has one", () => {
  const parsed = parseSteamManifestDownload(
    manifest({ appid: "7", StateFlags: "1026" })
  )!;

  assert.deepEqual(
    computeSteamDownloadBytes(
      parsed,
      {
        state: null,
        update: null,
        suspended: false,
        totals: { download: 50, stage: 100 },
      },
      25
    ),
    { done: 25, total: 100 }
  );
  assert.equal(computeSteamDownloadBytes(parsed, undefined, 25), null);
});

test("folder bytes add up nested files", async () => {
  const folder = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "hydra-steam-staging-")
  );
  await fs.promises.mkdir(path.join(folder, "a"));
  await fs.promises.writeFile(path.join(folder, "a", "one"), "x".repeat(5000));
  await fs.promises.writeFile(path.join(folder, "two"), "y".repeat(3000));

  assert.equal(await measureFolderBytes(folder), 8000);
  assert.equal(await measureFolderBytes(path.join(folder, "missing")), 0);
});

test("unfinished installs are listed by their install folder", async () => {
  const library = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "hydra-steam-library-")
  );
  const steamApps = path.join(library, "steamapps");
  await fs.promises.mkdir(steamApps, { recursive: true });
  await fs.promises.writeFile(
    path.join(steamApps, "appmanifest_1.acf"),
    manifest({ appid: "1", StateFlags: "1026", installdir: "Partial" })
  );
  await fs.promises.writeFile(
    path.join(steamApps, "appmanifest_2.acf"),
    manifest({ appid: "2", StateFlags: "4", installdir: "Done" })
  );

  assert.deepEqual(await listUnfinishedSteamInstallDirectories([library]), [
    path.join(steamApps, "common", "Partial"),
  ]);
});
