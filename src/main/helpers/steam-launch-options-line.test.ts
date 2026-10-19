import { describe, it } from "node:test";
import assert from "node:assert";
import {
  formatSteamLaunchOptions,
  steamCommandPlaceholder,
} from "./steam-launch-options-line.ts";

describe("formatSteamLaunchOptions", () => {
  it("leaves the options empty when nothing is added", () => {
    assert.strictEqual(
      formatSteamLaunchOptions({
        command: steamCommandPlaceholder,
        args: [],
        env: {},
      }),
      ""
    );
  });

  it("puts the environment first and the game where %command% goes", () => {
    assert.strictEqual(
      formatSteamLaunchOptions({
        command: "gamemoderun",
        args: [steamCommandPlaceholder, "-dx11"],
        env: {
          STEAM_COMPAT_DATA_PATH: "/home/me/prefixes/123",
          WINEDLLOVERRIDES: "dxgi=n,b;winmm=n,b",
        },
      }),
      "STEAM_COMPAT_DATA_PATH=/home/me/prefixes/123 WINEDLLOVERRIDES='dxgi=n,b;winmm=n,b' gamemoderun %command% -dx11"
    );
  });

  it("shell-quotes spaces and single quotes", () => {
    assert.strictEqual(
      formatSteamLaunchOptions({
        command: steamCommandPlaceholder,
        args: ["--name", "it's here"],
        env: { MANGOHUD_CONFIGFILE: "/home/me/My Configs/game.conf" },
      }),
      "MANGOHUD_CONFIGFILE='/home/me/My Configs/game.conf' %command% --name 'it'\\''s here'"
    );
  });
});
