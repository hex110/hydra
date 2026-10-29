import { describe, it } from "node:test";
import assert from "node:assert";
import {
  chooseReShadeProxyDll,
  chooseRenoDxMod,
  findRenoDxGame,
  isRenoDxModChoice,
  parseLatestReShadeDownload,
  parseRenoDxIndex,
  resolveRenoDxSettings,
} from "./renodx.js";

const artifact = (name: string, arch = "x64") => ({
  name,
  arch,
  size: 10,
  url: `./${name}`,
  path: `./${name}`,
});

const mod = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: id,
  variant: null,
  status: "stable",
  category: "game",
  notes: [],
  artifacts: [artifact(`renodx-${id}.addon64`)],
  ...extra,
});

const index = (games: unknown[]) => JSON.stringify({ games });

const parse = (games: unknown[]) => parseRenoDxIndex(index(games))!;

describe("parseRenoDxIndex", () => {
  it("reads games, mods and artifacts with absolute download URLs", () => {
    const [game] = parse([
      {
        id: "sekiro",
        title: "Sekiro",
        aliases: ["Sekiro 2019"],
        steam_appid: 814380,
        mods: [mod("fromsoft_engine")],
      },
    ]);
    assert.strictEqual(game.steamAppId, 814380);
    assert.deepStrictEqual(game.aliases, ["Sekiro 2019"]);
    assert.strictEqual(
      game.mods[0].artifacts[0].url,
      "https://github.com/clshortfuse/renodx/releases/download/snapshot/renodx-fromsoft_engine.addon64"
    );
  });

  it("keeps an unrated mod as unrated and an unknown category as related", () => {
    const [game] = parse([
      {
        id: "a",
        title: "A",
        mods: [mod("a", { status: null, category: "weird" })],
      },
    ]);
    assert.strictEqual(game.mods[0].status, null);
    assert.strictEqual(game.mods[0].category, "related");
  });

  it("drops artifacts that are not add-ons from RenoDX's releases", () => {
    const [game] = parse([
      {
        id: "a",
        title: "A",
        mods: [
          mod("a", {
            artifacts: [
              artifact("renodx-a.addon64"),
              artifact("evil.exe"),
              artifact("../x.addon64"),
              { ...artifact("renodx-b.addon64"), url: "https://example.com/b" },
              { ...artifact("renodx-c.addon64"), arch: "arm" },
            ],
          }),
        ],
      },
    ]);
    assert.deepStrictEqual(
      game.mods[0].artifacts.map((item) => item.name),
      ["renodx-a.addon64"]
    );
  });

  it("fails closed on anything it does not recognise", () => {
    assert.strictEqual(parseRenoDxIndex("not json"), null);
    assert.strictEqual(parseRenoDxIndex("[]"), null);
    assert.strictEqual(parseRenoDxIndex("{}"), null);
    assert.strictEqual(parseRenoDxIndex(index([])), null);
    assert.strictEqual(
      parseRenoDxIndex(index([{ id: "a", title: "A", mods: [] }])),
      null
    );
  });

  it("skips malformed entries but keeps the good ones", () => {
    const games = parse([
      null,
      { id: "x" },
      { id: "a", title: "A", mods: [mod("a")] },
    ]);
    assert.deepStrictEqual(
      games.map((game) => game.id),
      ["a"]
    );
  });
});

describe("findRenoDxGame", () => {
  const entries = parse([
    {
      id: "one",
      title: "Cyberpunk 2077",
      steam_appid: 1091500,
      mods: [mod("cp2077")],
    },
    {
      id: "two",
      title: "Hades II",
      aliases: ["Hades 2"],
      mods: [mod("hades2")],
    },
  ]);

  it("matches a Steam game by app id even when the title differs", () => {
    assert.strictEqual(
      findRenoDxGame(entries, { steamAppId: 1091500, title: "Cyberpunk" })?.id,
      "one"
    );
  });

  it("matches by title or alias without an app id", () => {
    assert.strictEqual(
      findRenoDxGame(entries, { steamAppId: null, title: "hades ii" })?.id,
      "two"
    );
    assert.strictEqual(
      findRenoDxGame(entries, { steamAppId: null, title: "Hades 2" })?.id,
      "two"
    );
  });

  it("finds nothing for an unknown game", () => {
    assert.strictEqual(
      findRenoDxGame(entries, { steamAppId: 5, title: "Nope" }),
      null
    );
  });
});

describe("chooseRenoDxMod", () => {
  const options = { architecture: "x64" as const, includePrerelease: false };
  const entry = (mods: unknown[]) => parse([{ id: "g", title: "G", mods }])[0];

  it("picks the game mod and its add-on for the architecture", () => {
    const choice = chooseRenoDxMod(
      entry([
        mod("g", {
          artifacts: [
            artifact("renodx-g.addon64"),
            artifact("renodx-g.addon32", "x86"),
          ],
        }),
      ]),
      { ...options, architecture: "x86" }
    );
    assert.ok(isRenoDxModChoice(choice));
    assert.strictEqual(choice.artifact.name, "renodx-g.addon32");
  });

  it("reports a game with no add-on for its architecture", () => {
    assert.deepStrictEqual(
      chooseRenoDxMod(entry([mod("g")]), { ...options, architecture: "x86" }),
      { reason: "no-artifact" }
    );
  });

  it("uses the 64-bit add-on when the architecture is unknown", () => {
    const choice = chooseRenoDxMod(entry([mod("g")]), {
      ...options,
      architecture: null,
    });
    assert.ok(isRenoDxModChoice(choice));
  });

  it("offers stable and unrated mods, and beta ones only when asked", () => {
    const betaOnly = entry([mod("g", { status: "beta" })]);
    assert.deepStrictEqual(chooseRenoDxMod(betaOnly, options), {
      reason: "prerelease-only",
    });
    assert.ok(
      isRenoDxModChoice(
        chooseRenoDxMod(betaOnly, { ...options, includePrerelease: true })
      )
    );
    assert.ok(
      isRenoDxModChoice(
        chooseRenoDxMod(entry([mod("g", { status: null })]), options)
      )
    );
  });

  it("prefers the plain mod over a variant, and stable over beta", () => {
    const choice = chooseRenoDxMod(
      entry([
        mod("alt", { variant: "Alternate" }),
        mod("beta", { status: "beta" }),
        mod("main"),
      ]),
      { ...options, includePrerelease: true }
    );
    assert.ok(isRenoDxModChoice(choice));
    assert.strictEqual(choice.mod.id, "main");
  });

  it("ignores engine mods and mods without a download", () => {
    assert.deepStrictEqual(
      chooseRenoDxMod(
        entry([
          mod("unrealengine", { category: "engine" }),
          mod("nodl", { artifacts: [] }),
        ]),
        options
      ),
      { reason: "no-mod" }
    );
  });
});

describe("chooseReShadeProxyDll", () => {
  const apis = (extra: object) => ({
    vulkan: false,
    direct3d9: false,
    dxgi: false,
    opengl: false,
    ...extra,
  });

  it("names the DLL by the graphics API", () => {
    assert.strictEqual(chooseReShadeProxyDll(apis({ dxgi: true })), "dxgi.dll");
    assert.strictEqual(
      chooseReShadeProxyDll(apis({ direct3d9: true })),
      "d3d9.dll"
    );
    assert.strictEqual(
      chooseReShadeProxyDll(apis({ opengl: true })),
      "opengl32.dll"
    );
  });

  it("prefers DXGI when a game has several APIs", () => {
    assert.strictEqual(
      chooseReShadeProxyDll(
        apis({ dxgi: true, direct3d9: true, vulkan: true })
      ),
      "dxgi.dll"
    );
  });

  it("has no name for a Vulkan-only game, and assumes DirectX when unknown", () => {
    assert.strictEqual(chooseReShadeProxyDll(apis({ vulkan: true })), null);
    assert.strictEqual(chooseReShadeProxyDll(apis({})), "dxgi.dll");
    assert.strictEqual(chooseReShadeProxyDll(null), "dxgi.dll");
  });
});

describe("parseLatestReShadeDownload", () => {
  it("finds the newest add-on installer", () => {
    const html = `<a href="downloads/ReShade_Setup_6.8.0_Addon.exe">a</a>
      <a href="downloads/ReShade_Setup_6.10.1_Addon.exe">b</a>
      <a href="downloads/ReShade_Setup_6.9.0.exe">no add-on support</a>`;
    assert.deepStrictEqual(parseLatestReShadeDownload(html), {
      version: "6.10.1",
      path: "downloads/ReShade_Setup_6.10.1_Addon.exe",
    });
  });

  it("is null when the page links no installer", () => {
    assert.strictEqual(parseLatestReShadeDownload("<html></html>"), null);
  });
});

describe("resolveRenoDxSettings", () => {
  it("installs by hand, hides prerelease mods and turns on HDR rules by default", () => {
    assert.deepStrictEqual(resolveRenoDxSettings(null), {
      autoInstall: false,
      includePrerelease: false,
      enableHdrRules: true,
    });
  });
});
