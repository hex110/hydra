import { describe, it } from "node:test";
import assert from "node:assert";
import stringArgv from "string-argv";
import { buildLaunchEnvironment } from "./launch-environment.ts";
import { applyDefaultLaunchOptions } from "./default-launch-options.ts";

describe("buildLaunchEnvironment", () => {
  it("adds nothing when no option is on", () => {
    assert.strictEqual(
      buildLaunchEnvironment({ hdr: false, nativeDlls: [] }),
      null
    );
  });

  it("enables every HDR switch Proton builds read", () => {
    assert.strictEqual(
      buildLaunchEnvironment({ hdr: true, nativeDlls: [] }),
      "PROTON_ENABLE_WAYLAND=1 PROTON_ENABLE_HDR=1 DXVK_HDR=1 %command%"
    );
  });

  it("prefers native copies of the given DLLs, once each", () => {
    assert.strictEqual(
      buildLaunchEnvironment({
        hdr: false,
        nativeDlls: ["dxgi", "WINMM", "winmm"],
      }),
      "WINEDLLOVERRIDES=dxgi=n,b;winmm=n,b %command%"
    );
  });

  it("lets the game's own launch options win and joins DLL overrides", () => {
    const merged = applyDefaultLaunchOptions(
      buildLaunchEnvironment({ hdr: true, nativeDlls: ["winmm"] }),
      "DXVK_HDR=0 WINEDLLOVERRIDES=version=n,b %command% -dx12"
    );
    assert.deepStrictEqual(stringArgv(merged ?? ""), [
      "WINEDLLOVERRIDES=winmm=n,b;version=n,b",
      "PROTON_ENABLE_WAYLAND=1",
      "PROTON_ENABLE_HDR=1",
      "DXVK_HDR=0",
      "%command%",
      "-dx12",
    ]);
  });
});
