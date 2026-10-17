import { describe, it } from "node:test";
import assert from "node:assert";
import {
  applyIniOverrides,
  compareOptiScalerVersions,
  evaluateOptiScalerEligibility,
  findOptiScalerCompatibilityEntry,
  isUpscalerLibrary,
  parseIniOverrides,
  parseOptiScalerCompatibilityList,
} from "./optiscaler.js";

const WIKI_PAGE = `> [!TIP]
> :muscle: **Working** — **710**

| GAME NAME | ✅/❌/➖ | DLSS/FSR3.1/XeSS | ✨ (if OptiPatcher supported, otherwise empty) | Notes go here | [#](url) |
-->

| Game | Compatibility | Upscaler <br>Inputs | OptiPatcher <br>Support | Notes | Images |
| ---- | :-----------: | :-----------------: | :---: | ----- | :----: |
| [1666: Amsterdam](1666-Amsterdam) | ✅ | DLSS, FSR3.1/4, XeSS | ✨ | Enable \`Non-Linear Color Space\`. | [1](https://example.com/1) |
| 63 Days | ✅ | XeSS |  |  | [1](https://example.com/2) |
|Outcast: A New Beginning | ✅ | DLSS |  | Run with -dx12. |
[Metro Exodus: Enhanced Edition](Metro-Exodus-Enhanced-Edition) | ✅ | DLSS |  |  | |
| EA Sports WRC | ❌ |  |  | EA Anti-cheat blocks unknown .dlls |
| [Minecraft RTX](Minecraft-RTX) | ➖ | DLSS |  | Windows: ✅. |  |

## Upscaler mods support

| Game | Compatibility | Upscaler <br>Inputs | Notes  | Images |
| ---- | :-----------: | :-----------------: | ------ | :----: |
| Some Mod Game | ✔️ | ✅ | DLSS |  |
`;

describe("parseOptiScalerCompatibilityList", () => {
  const entries = parseOptiScalerCompatibilityList(WIKI_PAGE);

  it("reads only the main table and skips single-OS rows", () => {
    assert.deepStrictEqual(
      entries.map((entry) => entry.title),
      [
        "1666: Amsterdam",
        "63 Days",
        "Outcast: A New Beginning",
        "Metro Exodus: Enhanced Edition",
        "EA Sports WRC",
      ]
    );
  });

  it("reads status, inputs, OptiPatcher support and notes", () => {
    assert.deepStrictEqual(entries[0], {
      title: "1666: Amsterdam",
      status: "working",
      upscalerInputs: "DLSS, FSR3.1/4, XeSS",
      optiPatcherSupported: true,
      notes: "Enable Non-Linear Color Space.",
      wikiSlug: "1666-Amsterdam",
    });
    assert.strictEqual(entries[1].wikiSlug, null);
    assert.strictEqual(entries[4].status, "not-working");
  });

  it("finds entries by title regardless of punctuation and editions", () => {
    assert.strictEqual(
      findOptiScalerCompatibilityEntry(entries, "Metro Exodus")?.title,
      "Metro Exodus: Enhanced Edition"
    );
    assert.strictEqual(
      findOptiScalerCompatibilityEntry(entries, "EA SPORTS™ WRC")?.status,
      "not-working"
    );
    assert.strictEqual(
      findOptiScalerCompatibilityEntry(entries, "Hades"),
      null
    );
  });

  it("returns nothing for pages without the table", () => {
    assert.deepStrictEqual(parseOptiScalerCompatibilityList("# Hi"), []);
  });
});

describe("isUpscalerLibrary", () => {
  it("recognises DLSS, XeSS, FSR and Streamline libraries", () => {
    for (const name of [
      "nvngx_dlss.dll",
      "libxess.dll",
      "amd_fidelityfx_dx12.dll",
      "amd_fidelityfx_upscaler_dx12.dll",
      "ffx_fsr2_api_x64.dll",
      "sl.interposer.dll",
    ]) {
      assert.ok(isUpscalerLibrary(name), name);
    }
  });

  it("ignores frame generation and unrelated libraries", () => {
    for (const name of ["nvngx_dlssg.dll", "libxess_fg.dll", "dxgi.dll"]) {
      assert.ok(!isUpscalerLibrary(name), name);
    }
  });
});

describe("parseIniOverrides", () => {
  it("reads sections and keys and reports invalid lines", () => {
    const parsed = parseIniOverrides(
      "; menu key\n[Menu]\nShortcutKey = 0x78\n\nnot valid\n[Spoofing]\nDxgi=false"
    );
    assert.deepStrictEqual(parsed.overrides, [
      { section: "Menu", key: "ShortcutKey", value: "0x78" },
      { section: "Spoofing", key: "Dxgi", value: "false" },
    ]);
    assert.deepStrictEqual(parsed.invalidLines, [5]);
  });

  it("rejects keys outside a section", () => {
    assert.deepStrictEqual(parseIniOverrides("Dxgi=false").invalidLines, [1]);
  });
});

describe("applyIniOverrides", () => {
  const document = [
    "[Menu]",
    "; Shortcut",
    "ShortcutKey=auto",
    "Scale=auto",
    "",
    "[Plugins]",
    "Path=auto",
    "",
  ].join("\r\n");

  it("replaces existing keys and keeps comments and line endings", () => {
    const result = applyIniOverrides(document, [
      { section: "menu", key: "shortcutkey", value: "0x78" },
    ]);
    assert.ok(result.includes("; Shortcut\r\nshortcutkey=0x78\r\nScale=auto"));
  });

  it("adds missing keys at the end of their section", () => {
    const result = applyIniOverrides(document, [
      { section: "Plugins", key: "LoadAsiPlugins", value: "true" },
    ]);
    assert.ok(result.includes("Path=auto\r\nLoadAsiPlugins=true\r\n"));
  });

  it("adds missing sections at the end", () => {
    const result = applyIniOverrides("[Menu]\nScale=auto\n", [
      { section: "Log", key: "LogLevel", value: "0" },
    ]);
    assert.strictEqual(result, "[Menu]\nScale=auto\n\n[Log]\nLogLevel=0");
  });
});

describe("compareOptiScalerVersions", () => {
  it("orders release and nightly tags numerically", () => {
    assert.ok(compareOptiScalerVersions("v0.9.10", "0.9.4") > 0);
    assert.ok(compareOptiScalerVersions("0.9.2a", "0.9.3") < 0);
    assert.ok(
      compareOptiScalerVersions("nightly-20261017", "nightly-20261016") > 0
    );
    assert.strictEqual(compareOptiScalerVersions("v0.9.4", "0.9.4"), 0);
  });
});

describe("evaluateOptiScalerEligibility", () => {
  const working = {
    title: "Returnal",
    status: "working" as const,
    upscalerInputs: "DLSS",
    optiPatcherSupported: false,
    notes: "",
    wikiSlug: null,
  };
  const all = { detectNativeUpscalers: true, useCompatibilityList: true };

  it("accepts games with upscalers or a working wiki entry", () => {
    assert.deepStrictEqual(
      evaluateOptiScalerEligibility(all, ["nvngx_dlss.dll"], working).reasons,
      ["native-upscaler", "compatibility-list"]
    );
    assert.ok(evaluateOptiScalerEligibility(all, [], working).eligible);
    assert.ok(
      evaluateOptiScalerEligibility(all, ["libxess.dll"], null).eligible
    );
    assert.ok(!evaluateOptiScalerEligibility(all, [], null).eligible);
  });

  it("honours disabled detection methods", () => {
    const listOnly = {
      detectNativeUpscalers: false,
      useCompatibilityList: true,
    };
    assert.ok(
      !evaluateOptiScalerEligibility(listOnly, ["libxess.dll"], null).eligible
    );
  });

  it("never accepts games the wiki lists as not working", () => {
    const result = evaluateOptiScalerEligibility(all, ["nvngx_dlss.dll"], {
      ...working,
      status: "not-working",
    });
    assert.strictEqual(result.eligible, false);
    assert.strictEqual(result.blocked, true);
  });
});
