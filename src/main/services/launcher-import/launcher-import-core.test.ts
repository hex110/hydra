import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import {
  lutrisRowsToInstalls,
  readHeroicInstalls,
} from "./launcher-import-core.ts";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "launcher-import-"));
after(() => fs.rmSync(root, { recursive: true, force: true }));

const write = (relative: string, content: unknown) => {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    typeof content === "string" ? content : JSON.stringify(content)
  );
};

describe("readHeroicInstalls", () => {
  const heroic = path.join(root, "heroic");
  const gogGame = path.join(root, "Games", "Gwent");

  write("heroic/legendaryConfig/legendary/installed.json", {
    Fortnite: {
      app_name: "Fortnite",
      title: "Hades",
      install_path: "/games/Hades",
      executable: "x64\\Hades.exe",
      platform: "Windows",
      is_dlc: false,
    },
    SomeDlc: { title: "DLC", install_path: "/games/dlc", is_dlc: true },
  });
  write("heroic/GamesConfig/Fortnite.json", {
    Fortnite: { winePrefix: "/prefixes/Hades" },
  });
  write("heroic/store/timestamp.json", {
    Fortnite: { totalPlayed: 90, lastPlayed: "2026-10-01T10:00:00.000Z" },
  });
  write("heroic/gog_store/installed.json", {
    installed: [
      { appName: "1207658930", install_path: gogGame, platform: "linux" },
    ],
  });
  write("heroic/store_cache/gog_library.json", {
    games: [{ app_name: "1207658930", title: "Gwent" }],
  });
  write("Games/Gwent/goggame-1207658930.info", {
    name: "GWENT",
    playTasks: [
      { type: "FileTask", path: "docs\\manual.pdf" },
      { isPrimary: true, type: "FileTask", path: "start.sh" },
    ],
  });
  write("heroic/sideload_apps/library.json", {
    games: [
      {
        app_name: "abc",
        title: "Sideloaded",
        install: { executable: "/games/side/game.exe", platform: "Windows" },
      },
      { app_name: "gone", title: "Gone", is_installed: false, install: {} },
    ],
  });

  it("reads Epic, GOG and sideloaded games with prefix and playtime", async () => {
    const installs = await readHeroicInstalls(heroic);
    assert.deepEqual(
      installs.map((install) => [
        install.store,
        install.title,
        install.executablePath,
        install.isWindows,
        install.winePrefixPath,
        install.playTimeInMinutes,
      ]),
      [
        [
          "epic",
          "Hades",
          "/games/Hades/x64/Hades.exe",
          true,
          "/prefixes/Hades",
          90,
        ],
        ["gog", "Gwent", path.join(gogGame, "start.sh"), false, null, 0],
        ["sideload", "Sideloaded", "/games/side/game.exe", true, null, 0],
      ]
    );
  });

  it("returns nothing without a Heroic folder", async () => {
    assert.deepEqual(await readHeroicInstalls(path.join(root, "nope")), []);
  });
});

describe("lutrisRowsToInstalls", () => {
  const data = path.join(root, "lutris");
  write(
    "lutris/games/hollow-knight-123.yml",
    "game:\n  exe: drive_c/HK/hollow_knight.exe\n  prefix: /prefixes/hk\nwine:\n  version: lutris-ge\n"
  );
  write("lutris/games/native-1.yml", "game:\n  exe: /games/native/run.sh\n");

  it("keeps installed Wine and Linux games and converts playtime", async () => {
    const installs = await lutrisRowsToInstalls(
      [
        {
          id: 1,
          name: "Hollow Knight",
          slug: "hollow-knight",
          runner: "wine",
          directory: "/prefixes/hk",
          installed: 1,
          configpath: "hollow-knight-123",
          playtime: 2.5,
          lastplayed: 1_790_000_000,
        },
        {
          id: 2,
          name: "Native",
          slug: "native",
          runner: "linux",
          directory: "",
          installed: 1,
          configpath: "native-1",
          playtime: null,
          lastplayed: null,
        },
        {
          id: 3,
          name: "Steam game",
          slug: "steam-game",
          runner: "steam",
          directory: null,
          installed: 1,
          configpath: null,
          playtime: 1,
          lastplayed: null,
        },
        {
          id: 4,
          name: "Not installed",
          slug: "nope",
          runner: "wine",
          directory: null,
          installed: 0,
          configpath: "x",
          playtime: 0,
          lastplayed: null,
        },
      ],
      data,
      root
    );
    assert.deepEqual(
      installs.map((install) => [
        install.title,
        install.executablePath,
        install.winePrefixPath,
        install.playTimeInMinutes,
        install.lastPlayedAt,
      ]),
      [
        [
          "Hollow Knight",
          "/prefixes/hk/drive_c/HK/hollow_knight.exe",
          "/prefixes/hk",
          150,
          new Date(1_790_000_000_000).toISOString(),
        ],
        ["Native", "/games/native/run.sh", null, 0, null],
      ]
    );
  });
});
