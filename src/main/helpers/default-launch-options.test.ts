import { describe, it } from "node:test";
import assert from "node:assert";
import stringArgv from "string-argv";
import { applyDefaultLaunchOptions } from "./default-launch-options.ts";

describe("applyDefaultLaunchOptions", () => {
  it("returns the game options when there are no defaults", () => {
    assert.strictEqual(applyDefaultLaunchOptions(null, "-dx12"), "-dx12");
    assert.strictEqual(applyDefaultLaunchOptions("   ", "-dx12"), "-dx12");
    assert.strictEqual(applyDefaultLaunchOptions(undefined, ""), null);
  });

  it("returns the defaults when the game has no options", () => {
    assert.strictEqual(
      applyDefaultLaunchOptions("PROTON_ENABLE_WAYLAND=1 %command%", null),
      "PROTON_ENABLE_WAYLAND=1 %command%"
    );
  });

  it("skips the defaults when the game opts out", () => {
    assert.strictEqual(
      applyDefaultLaunchOptions("A=1 %command%", "-windowed", true),
      "-windowed"
    );
    assert.strictEqual(
      applyDefaultLaunchOptions("A=1 %command%", null, true),
      null
    );
  });

  it("appends plain arguments without introducing %command%", () => {
    assert.strictEqual(
      applyDefaultLaunchOptions("-skipintro", "-dx12"),
      "-skipintro -dx12"
    );
  });

  it("merges env, wrappers and arguments from both sides", () => {
    assert.strictEqual(
      applyDefaultLaunchOptions(
        "A=1 B=2 gamemoderun %command% -skipintro",
        "B=3 C=4 mangohud %command% -dx12"
      ),
      "A=1 B=3 C=4 gamemoderun mangohud %command% -skipintro -dx12"
    );
  });

  it("wraps plain game arguments with the default command template", () => {
    assert.strictEqual(
      applyDefaultLaunchOptions("DXVK_ASYNC=1 %command%", "-windowed"),
      "DXVK_ASYNC=1 %command% -windowed"
    );
  });

  it("keeps DLL overrides from both sides", () => {
    assert.strictEqual(
      applyDefaultLaunchOptions(
        "WINEDLLOVERRIDES=dxgi=n,b %command%",
        "WINEDLLOVERRIDES=winmm=n,b %command%"
      ),
      "WINEDLLOVERRIDES=dxgi=n,b;winmm=n,b %command%"
    );
  });

  it("preserves arguments with spaces through a reparse", () => {
    const merged = applyDefaultLaunchOptions(
      `A=1 %command%`,
      `"+connect my server" -name 'two words'`
    );

    assert.deepStrictEqual(stringArgv(merged ?? ""), [
      "A=1",
      "%command%",
      "+connect my server",
      "-name",
      "two words",
    ]);
  });

  it("keeps environment values with spaces whole through a reparse", () => {
    const once = applyDefaultLaunchOptions(
      `"MANGOHUD_CONFIGFILE=/home/me/My Configs/game.conf" %command%`,
      "WINEDLLOVERRIDES=dxgi=n,b %command%"
    );
    const twice = applyDefaultLaunchOptions(
      once,
      "PROTON_ENABLE_HDR=1 %command%"
    );

    assert.deepStrictEqual(stringArgv(twice ?? ""), [
      "MANGOHUD_CONFIGFILE=/home/me/My Configs/game.conf",
      "WINEDLLOVERRIDES=dxgi=n,b",
      "PROTON_ENABLE_HDR=1",
      "%command%",
    ]);
  });

  it("layers the OptiScaler DLL override over merged options", () => {
    const merged = applyDefaultLaunchOptions(
      "WINEDLLOVERRIDES=dxgi=n,b %command%",
      applyDefaultLaunchOptions(
        "gamemoderun %command%",
        "WINEDLLOVERRIDES=winhttp=n,b %command% -dx12"
      )
    );

    assert.deepStrictEqual(stringArgv(merged ?? ""), [
      "WINEDLLOVERRIDES=dxgi=n,b;winhttp=n,b",
      "gamemoderun",
      "%command%",
      "-dx12",
    ]);
    assert.strictEqual(
      applyDefaultLaunchOptions("WINEDLLOVERRIDES=dxgi=n,b %command%", null),
      "WINEDLLOVERRIDES=dxgi=n,b %command%"
    );
  });
});
