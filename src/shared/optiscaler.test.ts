import { describe, it } from "node:test";
import assert from "node:assert";
import {
  chooseOptiScalerProxyDll,
  compareOptiScalerVersions,
  evaluateOptiScalerEligibility,
  findOptiScalerCompatibilityEntry,
  isUpscalerLibrary,
  parseOptiScalerCompatibilityList,
  parseOptiScalerWikiProxyDlls,
  resolveOptiScalerSettings,
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

const ENSHROUDED_WIKI_PAGE = `[cols="1,1"]
|===
|**Last Tested Version**
|0.9.4

|**Filename**
|\`winmm.dll\`, \`dbghelp.dll\`

|**OS**
|W11 24H2, Linux

|**Notes**
a|
* Game runs on Vulkan.
* If winmm.dll isn't working, try with \`dbghelp.dll\`
|===`;

describe("parseOptiScalerWikiProxyDlls", () => {
  it("reads the names under Filename, in order, and nothing else", () => {
    assert.deepStrictEqual(parseOptiScalerWikiProxyDlls(ENSHROUDED_WIKI_PAGE), [
      "winmm.dll",
      "dbghelp.dll",
    ]);
  });

  it("skips names Hydra cannot install and repeats", () => {
    const page =
      "|**Filename**\n|`dxgi.dll`, `OptiScaler.asi`, `DXGI.dll`\n\n|**OS**";
    assert.deepStrictEqual(parseOptiScalerWikiProxyDlls(page), ["dxgi.dll"]);
  });

  it("reads a bold label on one line", () => {
    assert.deepStrictEqual(
      parseOptiScalerWikiProxyDlls(
        "**Filename:** version.dll or winmm.dll\n\nNotes"
      ),
      ["version.dll", "winmm.dll"]
    );
  });

  it("finds nothing without a Filename field or a DLL in it", () => {
    assert.deepStrictEqual(parseOptiScalerWikiProxyDlls("No table here"), []);
    assert.deepStrictEqual(
      parseOptiScalerWikiProxyDlls(
        "|**Filename**\n|`OptiScaler.asi`\n\n|**OS**"
      ),
      []
    );
  });
});

describe("chooseOptiScalerProxyDll", () => {
  const free = new Set<string>();

  it("uses the wiki's first name", () => {
    assert.deepStrictEqual(
      chooseOptiScalerProxyDll({
        wikiDlls: ["winmm.dll", "dbghelp.dll"],
        vulkanOnly: false,
        occupied: free,
      }),
      { proxyDll: "winmm.dll", source: "wiki" }
    );
  });

  it("skips a name the game folder already has", () => {
    assert.deepStrictEqual(
      chooseOptiScalerProxyDll({
        wikiDlls: ["winmm.dll", "dbghelp.dll"],
        vulkanOnly: true,
        occupied: new Set(["winmm.dll"]),
      }),
      { proxyDll: "dbghelp.dll", source: "wiki" }
    );
  });

  it("uses the Vulkan names for a Vulkan-only game the wiki does not list", () => {
    assert.deepStrictEqual(
      chooseOptiScalerProxyDll({
        wikiDlls: [],
        vulkanOnly: true,
        occupied: free,
      }),
      { proxyDll: "winmm.dll", source: "vulkan" }
    );
    assert.deepStrictEqual(
      chooseOptiScalerProxyDll({
        wikiDlls: [],
        vulkanOnly: true,
        occupied: new Set(["winmm.dll"]),
      }),
      { proxyDll: "dbghelp.dll", source: "vulkan" }
    );
  });

  it("keeps dxgi.dll for DirectX or unknown games", () => {
    assert.deepStrictEqual(
      chooseOptiScalerProxyDll({
        wikiDlls: [],
        vulkanOnly: false,
        occupied: free,
      }),
      { proxyDll: "dxgi.dll", source: "default" }
    );
  });

  it("goes round a taken dxgi.dll", () => {
    assert.deepStrictEqual(
      chooseOptiScalerProxyDll({
        wikiDlls: ["dxgi.dll"],
        vulkanOnly: false,
        occupied: new Set(["dxgi.dll"]),
      }),
      { proxyDll: "winmm.dll", source: "default" }
    );
  });

  it("falls back to the wiki's name when every name is taken", () => {
    assert.deepStrictEqual(
      chooseOptiScalerProxyDll({
        wikiDlls: ["dbghelp.dll"],
        vulkanOnly: false,
        occupied: new Set([
          "dxgi.dll",
          "winmm.dll",
          "version.dll",
          "dbghelp.dll",
          "d3d12.dll",
          "wininet.dll",
          "winhttp.dll",
        ]),
      }),
      { proxyDll: "dbghelp.dll", source: "wiki" }
    );
  });
});

describe("resolveOptiScalerSettings proxy DLL", () => {
  it("is automatic until a name is chosen", () => {
    assert.strictEqual(resolveOptiScalerSettings(null).proxyDll, null);
    assert.strictEqual(
      resolveOptiScalerSettings({ optiScalerProxyDll: "version.dll" }).proxyDll,
      "version.dll"
    );
  });
});
