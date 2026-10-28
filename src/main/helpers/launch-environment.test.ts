import { describe, it } from "node:test";
import assert from "node:assert";
import stringArgv from "string-argv";
import { buildLaunchEnvironment } from "./launch-environment.ts";
import { applyDefaultLaunchOptions } from "./default-launch-options.ts";

describe("buildLaunchEnvironment", () => {
  it("adds nothing without DLLs", () => {
    assert.strictEqual(buildLaunchEnvironment({ nativeDlls: [] }), null);
  });

  it("prefers native copies of the given DLLs, once each", () => {
    assert.strictEqual(
      buildLaunchEnvironment({ nativeDlls: ["dxgi", "WINMM", "winmm"] }),
      "WINEDLLOVERRIDES=dxgi=n,b;winmm=n,b %command%"
    );
  });

  it("disables the given DLLs, once each, after the native ones", () => {
    assert.strictEqual(
      buildLaunchEnvironment({
        nativeDlls: ["winmm"],
        disabledDlls: ["lsteamclient", "LSteamClient"],
      }),
      "WINEDLLOVERRIDES=winmm=n,b;lsteamclient=d %command%"
    );
    assert.strictEqual(
      buildLaunchEnvironment({
        nativeDlls: [],
        disabledDlls: ["lsteamclient"],
      }),
      "WINEDLLOVERRIDES=lsteamclient=d %command%"
    );
  });

  it("lets later layers win and joins DLL overrides", () => {
    const hdrRule = "PROTON_ENABLE_HDR=1 DXVK_HDR=1 %command%";
    const merged = applyDefaultLaunchOptions(
      applyDefaultLaunchOptions(
        buildLaunchEnvironment({ nativeDlls: ["winmm"] }),
        hdrRule
      ),
      "DXVK_HDR=0 WINEDLLOVERRIDES=version=n,b %command% -dx12"
    );
    assert.deepStrictEqual(stringArgv(merged ?? ""), [
      "WINEDLLOVERRIDES=winmm=n,b;version=n,b",
      "PROTON_ENABLE_HDR=1",
      "DXVK_HDR=0",
      "%command%",
      "-dx12",
    ]);
  });
});
