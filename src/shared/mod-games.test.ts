import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  HYDRA_GAME_SUPPORT,
  detectModLoader,
  detectUnityRuntime,
  detectedGameSupport,
  findNeededLoader,
  findProxyDllClash,
  matchGameSupport,
  pickEvidenceLoader,
  planModPlacement,
  thunderstoreGameSupport,
  unityGameSupport,
  type ThunderstoreSchema,
} from "./mod-games.js";

const belmont = HYDRA_GAME_SUPPORT.find(
  (definition) => definition.id === "castlevaniabelmontscurse"
)!;
const root = new Set([
  "castlevania belmont's curse.exe",
  "castlevania belmont's curse_data",
  "gameassembly.dll",
  "unityplayer.dll",
  "readme.txt",
]);
const targets = (placement: ReturnType<typeof planModPlacement>) =>
  placement.files.map((file) => file.target);

describe("planModPlacement", () => {
  it("keeps an archive laid out like the game folder", () => {
    const placement = planModPlacement({
      files: [
        "BelmontsCurseUltrawide/README.md",
        "BepInEx/plugins/BelmontsCurseUltrawide.dll",
      ],
      definition: belmont,
      gameRootEntries: root,
      modName: "Ultrawide Fix",
    });
    assert.deepEqual(targets(placement), [
      "BelmontsCurseUltrawide/README.md",
      "BepInEx/plugins/BelmontsCurseUltrawide.dll",
    ]);
  });

  it("puts a loose plugin into its own folder under BepInEx/plugins", () => {
    const placement = planModPlacement({
      files: ["SmoothMotion.dll", "readme.txt"],
      definition: belmont,
      gameRootEntries: root,
      modName: "Smooth Motion: High FPS",
    });
    assert.deepEqual(targets(placement), [
      "BepInEx/plugins/Smooth Motion High FPS/SmoothMotion.dll",
      "BepInEx/plugins/Smooth Motion High FPS/readme.txt",
    ]);
  });

  it("takes off a folder named after the mod", () => {
    const placement = planModPlacement({
      files: ["BootFrameCap/BootFrameCap.dll", "BootFrameCap/BootFrameCap.cfg"],
      definition: belmont,
      gameRootEntries: root,
      modName: "Start-up black screen fix",
    });
    assert.deepEqual(targets(placement), [
      "BepInEx/plugins/Start-up black screen fix/BootFrameCap.dll",
      "BepInEx/plugins/Start-up black screen fix/BootFrameCap.cfg",
    ]);
    assert.equal(placement.files[0].archive, "BootFrameCap/BootFrameCap.dll");
  });

  it("routes Thunderstore package folders by their name", () => {
    const placement = planModPlacement({
      files: ["manifest.json", "plugins/Foo.dll", "config/foo.cfg"],
      definition: belmont,
      gameRootEntries: root,
      modName: "Foo",
    });
    assert.deepEqual(targets(placement), [
      "BepInEx/plugins/Foo/manifest.json",
      "BepInEx/plugins/Foo/Foo.dll",
      "BepInEx/config/foo.cfg",
    ]);
  });

  it("lays out a loader pack from inside its folder and leaves its packaging out", () => {
    const placement = planModPlacement({
      files: [
        "manifest.json",
        "icon.png",
        "BepInExPack_Valheim/winhttp.dll",
        "BepInExPack_Valheim/doorstop_config.ini",
        "BepInExPack_Valheim/BepInEx/core/BepInEx.dll",
      ],
      definition: belmont,
      gameRootEntries: root,
      modName: "BepInExPack",
    });
    assert.deepEqual(targets(placement), [
      "winhttp.dll",
      "doorstop_config.ini",
      "BepInEx/core/BepInEx.dll",
    ]);
    assert.deepEqual(placement.skipped, ["manifest.json", "icon.png"]);
  });

  it("treats a file that replaces one of the game's own as game-folder layout", () => {
    const placement = planModPlacement({
      files: ["UnityPlayer.dll"],
      definition: belmont,
      gameRootEntries: root,
      modName: "Patch",
    });
    assert.deepEqual(targets(placement), ["UnityPlayer.dll"]);
  });
});

describe("detectModLoader", () => {
  it("finds BepInEx 6 and the proxy DLL it ships", () => {
    assert.deepEqual(
      detectModLoader([
        "winhttp.dll",
        "doorstop_config.ini",
        "BepInEx/core/BepInEx.Core.dll",
        "dotnet/coreclr.dll",
      ]),
      { kind: "bepinex", nativeDlls: ["winhttp"] }
    );
  });

  it("falls back to the loader's usual proxy DLL", () => {
    assert.deepEqual(detectModLoader(["BepInEx/core/BepInEx.dll"]), {
      kind: "bepinex",
      nativeDlls: ["winhttp"],
    });
  });

  it("finds MelonLoader", () => {
    assert.deepEqual(
      detectModLoader(["version.dll", "MelonLoader/net6/MelonLoader.dll"]),
      { kind: "melonloader", nativeDlls: ["version"] }
    );
  });

  it("finds nothing in a plugin", () => {
    assert.equal(detectModLoader(["BepInEx/plugins/Foo.dll"]), null);
  });
});

describe("findNeededLoader", () => {
  it("needs BepInEx for files in its folders", () => {
    assert.equal(
      findNeededLoader(["BepInEx/plugins/Foo/Foo.dll"], "bepinex"),
      "bepinex"
    );
    assert.equal(
      findNeededLoader(
        ["Castlevania Belmont's Curse_Data/x.bundle"],
        "bepinex"
      ),
      null
    );
  });
});

describe("detectUnityRuntime", () => {
  it("tells IL2CPP from Mono", () => {
    assert.equal(
      detectUnityRuntime({
        rootEntries: root,
        exeName: "Castlevania Belmont's Curse.exe",
        hasManagedFolder: false,
      }),
      "il2cpp"
    );
    assert.equal(
      detectUnityRuntime({
        rootEntries: new Set(["unityplayer.dll", "game_data"]),
        exeName: "Game.exe",
        hasManagedFolder: true,
      }),
      "mono"
    );
    assert.equal(
      detectUnityRuntime({
        rootEntries: new Set(["bin", "game.exe"]),
        exeName: "Game.exe",
        hasManagedFolder: false,
      }),
      null
    );
  });

  it("gives IL2CPP games BepInEx 6", () => {
    assert.equal(unityGameSupport("il2cpp").loader?.name, "BepInEx 6 (IL2CPP)");
    assert.equal(unityGameSupport("mono").loader?.name, "BepInEx 5");
  });
});

describe("matchGameSupport", () => {
  it("matches by Steam app id, Nexus domain or exe name", () => {
    const match = (game: Parameters<typeof matchGameSupport>[1]) =>
      matchGameSupport(HYDRA_GAME_SUPPORT, game)?.id ?? null;
    const none = { steamAppId: null, nexusDomain: null, exeName: null };
    assert.equal(
      match({ ...none, steamAppId: "4231820" }),
      "castlevaniabelmontscurse"
    );
    assert.equal(
      match({ ...none, nexusDomain: "castlevaniabelmontscurse" }),
      "castlevaniabelmontscurse"
    );
    assert.equal(
      match({ ...none, exeName: "Castlevania Belmont's Curse.exe" }),
      "castlevaniabelmontscurse"
    );
    assert.equal(match({ ...none, exeName: "other.exe" }), null);
  });

  it("never matches a generic exe name", () => {
    const definitions = [
      {
        ...HYDRA_GAME_SUPPORT[0],
        id: "sexybrutale",
        match: { exeNames: ["game.exe"] },
      },
    ];
    const none = { steamAppId: null, nexusDomain: null };
    assert.equal(
      matchGameSupport(definitions, { ...none, exeName: "Game.exe" }),
      null
    );
  });
});

describe("findProxyDllClash", () => {
  it("finds a tool using the loader's DLL", () => {
    assert.deepEqual(
      findProxyDllClash(
        ["winhttp"],
        [
          { tool: "ReShade", dll: "dxgi" },
          { tool: "OptiScaler", dll: "winhttp.dll" },
        ]
      ),
      { tool: "OptiScaler", dll: "winhttp.dll" }
    );
    assert.equal(
      findProxyDllClash(["winhttp"], [{ tool: "OptiScaler", dll: null }]),
      null
    );
  });
});

describe("thunderstoreGameSupport", () => {
  it("turns a game's install rules and loader into a definition", () => {
    const schema: ThunderstoreSchema = {
      games: {
        valheim: {
          r2modman: [
            {
              meta: { displayName: "Valheim" },
              distributions: [{ platform: "steam", identifier: "892970" }],
              exeNames: ["valheim.exe", "valheim.x86_64"],
              packageIndex:
                "https://thunderstore.io/c/valheim/api/v1/package-listing-index/",
              packageLoader: "bepinex",
              gameInstanceType: "game",
              installRules: [
                {
                  route: "BepInEx/plugins",
                  defaultFileExtensions: [".dll"],
                  trackingMethod: "subdir",
                  isDefaultLocation: true,
                },
                { route: "BepInEx/config", trackingMethod: "none" },
              ],
            },
            {
              meta: { displayName: "Valheim Dedicated Server" },
              distributions: [{ platform: "steam", identifier: "896660" }],
              gameInstanceType: "server",
            },
          ],
        },
        other: {
          r2modman: [
            {
              distributions: [{ platform: "steam", identifier: "1" }],
              packageLoader: "shimloader",
            },
          ],
        },
      },
      modloaderPackages: [
        {
          packageId: "denikson-BepInExPack_Valheim",
          rootFolder: "BepInExPack_Valheim",
          loader: "bepinex",
        },
        { packageId: "LavaGang-MelonLoader", loader: "melonloader" },
      ],
    };
    const [valheim, other] = thunderstoreGameSupport(schema, "2026-11-04");
    assert.equal(valheim.id, "thunderstore:valheim");
    assert.deepEqual(valheim.match, {
      steamAppIds: ["892970"],
      exeNames: ["valheim.exe"],
    });
    assert.deepEqual(valheim.modTypes, [
      {
        target: "game:BepInEx/plugins",
        extensions: [".dll"],
        isDefault: true,
        perModFolder: true,
      },
      {
        target: "game:BepInEx/config",
        extensions: undefined,
        isDefault: undefined,
        perModFolder: undefined,
      },
    ]);
    assert.deepEqual(valheim.loader?.package, {
      kind: "thunderstore",
      community: "valheim",
      packageIds: ["denikson-BepInExPack_Valheim"],
    });
    assert.equal(other.loader, undefined);
    assert.equal(other.unsupportedLoader, "shimloader");
  });
});

describe("detectedGameSupport", () => {
  const evidence = (mods: Record<string, number>) => ({
    checkedAt: "2026-11-04T00:00:00.000Z",
    gameId: 1,
    mods,
  });

  it("gives a Unity game MelonLoader when its mods use it", () => {
    const definition = detectedGameSupport({
      runtime: "il2cpp",
      evidence: evidence({ melonloader: 12, bepinex: 1 }),
    });
    assert.equal(definition?.loader?.kind, "melonloader");
    assert.match(definition!.source, /12 of its mods ship MelonLoader/);
  });

  it("keeps BepInEx for a Unity game without enough evidence", () => {
    const definition = detectedGameSupport({
      runtime: "mono",
      evidence: evidence({ melonloader: 1 }),
    });
    assert.equal(definition?.loader?.name, "BepInEx 5");
  });

  it("names a loader Hydra can't install for other games", () => {
    const definition = detectedGameSupport({
      runtime: null,
      evidence: evidence({ ue4ss: 30, bepinex: 0 }),
    });
    assert.equal(definition?.unsupportedLoader, "UE4SS");
    assert.deepEqual(definition?.modTypes, []);
    assert.equal(definition?.loader, undefined);
  });

  it("knows nothing about a game with no signs", () => {
    assert.equal(
      detectedGameSupport({ runtime: null, evidence: evidence({}) }),
      null
    );
  });
});

describe("pickEvidenceLoader", () => {
  it("needs more than one mod", () => {
    assert.equal(
      pickEvidenceLoader({ checkedAt: "", gameId: 1, mods: { ue4ss: 1 } }),
      null
    );
  });
});
