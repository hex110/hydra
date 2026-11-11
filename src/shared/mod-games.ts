import type {
  GameSupportDefinition,
  InstalledModLoader,
  ModLoaderKind,
  ModLoaderSupport,
  ModTypeRule,
} from "../types/mods.types.js";

/**
 * Facts about the mod loaders Hydra knows: the files that mark a loader in a
 * mod's archive, the proxy DLL it loads through, and the folders only the
 * loader reads (a mod with files there does nothing without it).
 */
export const MOD_LOADERS: Record<
  ModLoaderKind,
  {
    name: string;
    /** A path in the loader's own layout, relative to the game folder. */
    marker: RegExp;
    /** Proxy DLLs it uses when the archive has none of the known ones. */
    defaultNativeDlls: string[];
    /** Lower-case top folders, relative to the game folder. */
    folders: string[];
  }
> = {
  bepinex: {
    name: "BepInEx",
    marker: /(^|\/)bepinex\/core\/bepinex(\.core|\.preloader)?\.dll$/i,
    defaultNativeDlls: ["winhttp"],
    folders: ["bepinex"],
  },
  melonloader: {
    name: "MelonLoader",
    marker: /(^|\/)melonloader\/(net6\/|net35\/)?melonloader\.dll$/i,
    defaultNativeDlls: ["version"],
    folders: ["melonloader", "mods", "plugins", "userlibs"],
  },
};

/** DLL names Unity loaders proxy through (UnityDoorstop and MelonLoader). */
const PROXY_DLLS = new Set([
  "winhttp",
  "version",
  "winmm",
  "dinput8",
  "dsound",
  "d3d8",
  "d3d9",
  "d3d10",
  "d3d11",
  "dxgi",
]);

const normalize = (filePath: string) =>
  filePath.replaceAll("\\", "/").replace(/^\.\/+/, "");

const lower = (value: string) => value.toLowerCase();

const DOCUMENT_FILE = /^(readme|license|licence|changelog|credits)(\.\w+)?$/i;

/** The loader whose files a mod ships, laid out relative to the game folder. */
export const detectModLoader = (files: string[]): InstalledModLoader | null => {
  const normalized = files.map(normalize);
  for (const [kind, loader] of Object.entries(MOD_LOADERS) as [
    ModLoaderKind,
    (typeof MOD_LOADERS)[ModLoaderKind],
  ][]) {
    if (!normalized.some((file) => loader.marker.test(file))) continue;
    const proxies = normalized
      .filter((file) => !file.includes("/"))
      .map((file) => /^(.+)\.dll$/i.exec(file)?.[1]?.toLowerCase())
      .filter((name): name is string => !!name && PROXY_DLLS.has(name));
    return {
      kind,
      nativeDlls: proxies.length > 0 ? proxies : loader.defaultNativeDlls,
    };
  }
  return null;
};

/** The loader a mod's placed files need, from the folders they go into. */
export const findNeededLoader = (
  targets: string[],
  loader: ModLoaderKind | undefined
): ModLoaderKind | null => {
  if (!loader) return null;
  const folders = MOD_LOADERS[loader].folders;
  return targets.some((target) =>
    folders.includes(lower(normalize(target).split("/")[0]))
  )
    ? loader
    : null;
};

/** BepInEx's own folders, as r2modman and Thunderstore route them. */
const BEPINEX_MOD_TYPES: ModTypeRule[] = [
  {
    target: "game:BepInEx/plugins",
    extensions: [".dll"],
    isDefault: true,
    perModFolder: true,
  },
  { target: "game:BepInEx/patchers", perModFolder: true },
  {
    target: "game:BepInEx/monomod",
    extensions: [".mm.dll"],
    perModFolder: true,
  },
  { target: "game:BepInEx/core", perModFolder: true },
  { target: "game:BepInEx/config" },
];

/** BepInEx 6 bleeding-edge build for IL2CPP games, the one most of their mods target. */
export const BEPINEX_IL2CPP_LOADER: ModLoaderSupport = {
  kind: "bepinex",
  name: "BepInEx 6 (IL2CPP)",
  package: {
    kind: "url",
    url: "https://builds.bepinex.dev/projects/bepinex_be/788/BepInEx-Unity.IL2CPP-win-x64-6.0.0-be.788%2B5b766a3.zip",
    version: "6.0.0-be.788",
    fileName: "BepInEx-Unity.IL2CPP-win-x64-6.0.0-be.788.zip",
  },
};

/** BepInEx 5, the stable release, for Mono Unity games. */
export const BEPINEX_MONO_LOADER: ModLoaderSupport = {
  kind: "bepinex",
  name: "BepInEx 5",
  package: {
    kind: "url",
    url: "https://github.com/BepInEx/BepInEx/releases/download/v5.4.23.6/BepInEx_win_x64_5.4.23.6.zip",
    version: "5.4.23.6",
    fileName: "BepInEx_win_x64_5.4.23.6.zip",
  },
};

/**
 * Games written by hand. Each names where its facts came from; facts from GPL
 * projects are written in Hydra's own words, never copied.
 */
export const HYDRA_GAME_SUPPORT: GameSupportDefinition[] = [
  {
    id: "castlevaniabelmontscurse",
    name: "Castlevania: Belmont's Curse",
    match: {
      steamAppIds: ["4231820"],
      nexusDomains: ["castlevaniabelmontscurse"],
      exeNames: ["castlevania belmont's curse.exe"],
    },
    modTypes: BEPINEX_MOD_TYPES,
    loader: BEPINEX_IL2CPP_LOADER,
    source:
      "Nexus Mods castlevaniabelmontscurse: BepInEx 6.0.0-be.788 (IL2CPP) is the loader its mods are built for (mods 3, 13, 20); Proton needs winhttp=n,b (ollieatkinson/castlevania-belmonts-curse-ultrawide README, 2026-11-04)",
    origin: "hydra",
  },
];

export type UnityRuntime = "il2cpp" | "mono";

/**
 * Whether a game folder holds a Windows Unity game, and which scripting
 * runtime it uses: IL2CPP games ship `GameAssembly.dll`, Mono games a
 * `<exe>_Data/Managed` folder.
 */
export const detectUnityRuntime = ({
  rootEntries,
  exeName,
  hasManagedFolder,
}: {
  /** Lower-case names in the game folder. */
  rootEntries: Set<string>;
  exeName: string;
  hasManagedFolder: boolean;
}): UnityRuntime | null => {
  const dataFolder = `${lower(exeName).replace(/\.exe$/, "")}_data`;
  const isUnity =
    rootEntries.has("unityplayer.dll") || rootEntries.has(dataFolder);
  if (!isUnity) return null;
  if (rootEntries.has("gameassembly.dll")) return "il2cpp";
  return hasManagedFolder ? "mono" : null;
};

/** MelonLoader's folders: mods in `Mods`, plugins in `Plugins`, libraries in `UserLibs`. */
const MELONLOADER_MOD_TYPES: ModTypeRule[] = [
  { target: "game:Mods", extensions: [".dll"], isDefault: true },
  { target: "game:Plugins" },
  { target: "game:UserLibs" },
  { target: "game:UserData" },
];

/** MelonLoader's release zip: `version.dll` and `MelonLoader/`. */
export const MELONLOADER_LOADER: ModLoaderSupport = {
  kind: "melonloader",
  name: "MelonLoader",
  package: {
    kind: "url",
    url: "https://github.com/LavaGang/MelonLoader/releases/download/v0.7.3/MelonLoader.x64.zip",
    version: "0.7.3",
    fileName: "MelonLoader.x64.zip",
  },
};

/**
 * Loaders a game's Nexus mods can show: files only the loader ships, or a
 * folder only its mods use. Counted per game through Nexus's file contents
 * search, so Hydra learns a game's loader from what its mods contain.
 */
export const LOADER_SIGNS: {
  id: string;
  name: string;
  kind?: ModLoaderKind;
  fileNames: string[];
  /** Path segments (folder names, as cased in archives) only its mods use. */
  folders?: string[];
}[] = [
  {
    id: "bepinex",
    name: "BepInEx",
    kind: "bepinex",
    fileNames: ["BepInEx.Core.dll", "BepInEx.dll"],
    folders: ["BepInEx"],
  },
  {
    id: "melonloader",
    name: "MelonLoader",
    kind: "melonloader",
    fileNames: ["MelonLoader.dll"],
    folders: ["MelonLoader"],
  },
  {
    id: "ue4ss",
    name: "UE4SS",
    fileNames: ["UE4SS.dll"],
    folders: ["ue4ss", "UE4SS"],
  },
  {
    id: "reframework",
    name: "REFramework",
    fileNames: ["REFramework.dll"],
    folders: ["reframework", "REFramework"],
  },
  {
    id: "smapi",
    name: "SMAPI",
    fileNames: ["StardewModdingAPI.dll", "StardewModdingAPI.exe"],
  },
  {
    id: "script-extender",
    name: "a script extender (SKSE, F4SE, xNVSE, OBSE, SFSE)",
    fileNames: [
      "skse64_loader.exe",
      "skse_loader.exe",
      "f4se_loader.exe",
      "nvse_loader.exe",
      "obse_loader.exe",
      "sfse_loader.exe",
    ],
  },
];

/** How many of a game's Nexus mods show each loader. */
export interface NexusLoaderEvidence {
  checkedAt: string;
  gameId: number;
  /** Distinct mods per sign id. */
  mods: Record<string, number>;
}

/** Mods a loader needs to be counted as the game's: one could be a stray. */
export const MIN_LOADER_EVIDENCE_MODS = 2;

/** Hydra stops counting a loader's mods here: enough to compare loaders. */
export const MAX_LOADER_EVIDENCE_MODS = 20;

/** The loader most of a game's Nexus mods show, when enough of them do. */
export const pickEvidenceLoader = (
  evidence: NexusLoaderEvidence | null | undefined
) => {
  if (!evidence) return null;
  const best = LOADER_SIGNS.map((sign) => ({
    sign,
    mods: evidence.mods[sign.id] ?? 0,
  }))
    .filter((item) => item.mods >= MIN_LOADER_EVIDENCE_MODS)
    .toSorted((a, b) => b.mods - a.mods)[0];
  return best ?? null;
};

/**
 * A definition for a game Hydra has no entry for, from its files and its Nexus
 * mods: a Unity game takes BepInEx unless its mods show MelonLoader; any game
 * whose mods show a loader Hydra can't install yet names it.
 */
export const detectedGameSupport = ({
  runtime,
  evidence,
}: {
  runtime: UnityRuntime | null;
  evidence?: NexusLoaderEvidence | null;
}): GameSupportDefinition | null => {
  const picked = pickEvidenceLoader(evidence);
  const fromNexus = picked
    ? `Nexus Mods: ${picked.mods} of its mods ship ${picked.sign.name} files (checked ${evidence!.checkedAt.slice(0, 10)})`
    : null;
  const fromFiles =
    runtime === "il2cpp"
      ? "the game folder: UnityPlayer.dll and GameAssembly.dll"
      : runtime === "mono"
        ? "the game folder: UnityPlayer.dll and a Managed folder"
        : null;
  const source = `Detected from ${[fromFiles, fromNexus].filter(Boolean).join("; and ")}`;

  if (runtime) {
    const melon = picked?.sign.kind === "melonloader";
    const unsupported =
      picked && !picked.sign.kind ? picked.sign.name : undefined;
    return {
      id: `unity-${runtime}${melon ? "-melonloader" : ""}`,
      name: runtime === "il2cpp" ? "Unity game (IL2CPP)" : "Unity game (Mono)",
      match: {},
      modTypes: melon ? MELONLOADER_MOD_TYPES : BEPINEX_MOD_TYPES,
      loader: unsupported
        ? undefined
        : melon
          ? MELONLOADER_LOADER
          : runtime === "il2cpp"
            ? BEPINEX_IL2CPP_LOADER
            : BEPINEX_MONO_LOADER,
      unsupportedLoader: unsupported,
      source,
      origin: "detected",
    };
  }
  // Not a Unity game: BepInEx or MelonLoader builds can't be picked without
  // knowing the runtime, so every loader is named, not installed.
  if (!picked) return null;
  return {
    id: `nexus-${picked.sign.id}`,
    name: `Mods built for ${picked.sign.name}`,
    match: {},
    modTypes: [],
    unsupportedLoader: picked.sign.name,
    source,
    origin: "detected",
  };
};

/** A definition for a Unity game Hydra has no entry for: BepInEx, as most of them use. */
export const unityGameSupport = (runtime: UnityRuntime) =>
  detectedGameSupport({ runtime })!;

/**
 * Exe names many games use (engine defaults, launchers, shells): matching one
 * says nothing about which game it is. Thunderstore lists some of them for a
 * single game (`game.exe` for The Sexy Brutale).
 */
export const GENERIC_EXE_NAMES = new Set([
  "game.exe",
  "windowsplayer.exe",
  "unityplayer.exe",
  "main.exe",
  "launcher.exe",
  "start.exe",
  "run.exe",
  "play.exe",
  "app.exe",
  "client.exe",
  "setup.exe",
  "nw.exe",
  "electron.exe",
  "godot.exe",
  "sh.exe",
  "cd.exe",
  "game-win64-shipping.exe",
]);

/**
 * The definition for a library game, by Steam app id, Nexus domain, then exe
 * name (never a generic one).
 */
export const matchGameSupport = (
  definitions: GameSupportDefinition[],
  game: {
    steamAppId: string | null;
    nexusDomain: string | null;
    exeName: string | null;
  }
) => {
  const exe =
    game.exeName && !GENERIC_EXE_NAMES.has(lower(game.exeName))
      ? lower(game.exeName)
      : null;
  return (
    (game.steamAppId &&
      definitions.find((definition) =>
        definition.match.steamAppIds?.includes(game.steamAppId!)
      )) ||
    (game.nexusDomain &&
      definitions.find((definition) =>
        definition.match.nexusDomains?.includes(game.nexusDomain!)
      )) ||
    (exe &&
      definitions.find((definition) =>
        definition.match.exeNames?.includes(exe)
      )) ||
    null
  );
};

export const modTypePath = (rule: ModTypeRule) =>
  rule.target.replace(/^game:/, "");

export const defaultModFolder = (definition: GameSupportDefinition) => {
  const rule =
    definition.modTypes.find((item) => item.isDefault) ??
    definition.modTypes[0];
  return rule ? modTypePath(rule) : "";
};

/** A folder name for a mod's own files: the characters Windows allows. */
export const modFolderName = (name: string) =>
  name.replaceAll(/[\\/:*?"<>|]+/g, "").trim() || "mod";

export interface ModPlacement {
  files: { archive: string; target: string }[];
  /** Archive files left out: the packaging around a loader. */
  skipped: string[];
  /** For the activity log. */
  description: string;
  /** Something in the archive matched the definition: a folder, an extension, the loader. */
  recognised: boolean;
}

/**
 * Where each file of an unpacked archive goes, by a game's definition:
 *
 * 1. An archive that ships the loader is laid out like the game folder; the
 *    folder around it (a Thunderstore pack's `BepInExPack/`) is taken off and
 *    the files beside that folder (manifest, icon, readme) are left out.
 * 2. An archive whose top level has a folder of the game or of a mod type
 *    (`BepInEx/plugins/…`) is laid out like the game folder too.
 * 3. Otherwise each file is routed: a top folder named like a mod type's
 *    folder (`plugins/…`) goes there, a file with a mod type's extension
 *    goes there, and the rest goes to the default mod type. A single folder
 *    around everything is the mod's name and is taken off first.
 */
export const planModPlacement = ({
  files,
  definition,
  gameRootEntries,
  modName,
}: {
  files: string[];
  definition: GameSupportDefinition;
  /** Lower-case names in the game folder. */
  gameRootEntries: Set<string>;
  modName: string;
}): ModPlacement => {
  const normalized = files.map(normalize);
  const paths = definition.modTypes.map((rule) => modTypePath(rule));
  const routeTops = new Set(paths.map((item) => lower(item.split("/")[0])));

  const loaderKind = definition.loader?.kind;
  const marker = loaderKind ? MOD_LOADERS[loaderKind].marker : null;
  const markerFile = marker
    ? normalized.find((file) => marker.test(file))
    : undefined;
  if (marker && markerFile) {
    const match = marker.exec(markerFile)!;
    const prefix = markerFile.slice(0, match.index + match[1].length);
    const inside = normalized.filter((file) => file.startsWith(prefix));
    return {
      files: inside.map((file) => ({
        archive: file,
        target: file.slice(prefix.length),
      })),
      skipped: normalized.filter((file) => !file.startsWith(prefix)),
      recognised: true,
      description: prefix
        ? `the archive ships ${definition.loader!.name} inside ${prefix.slice(0, -1)}, laid out like the game folder`
        : `the archive ships ${definition.loader!.name}, laid out like the game folder`,
    };
  }

  const tops = (list: string[]) => [
    ...new Set(list.map((file) => lower(file.split("/")[0]))),
  ];
  const isKnownTop = (top: string) =>
    routeTops.has(top) || gameRootEntries.has(top);

  let wrapper = "";
  let inner = normalized;
  for (let depth = 0; depth < 3; depth++) {
    const top = tops(inner);
    if (
      top.length !== 1 ||
      isKnownTop(top[0]) ||
      !inner.every((file) => file.includes("/"))
    )
      break;
    const folder = inner[0].split("/")[0];
    wrapper = wrapper ? `${wrapper}/${folder}` : folder;
    inner = inner.map((file) => file.slice(folder.length + 1));
  }
  const strip = (file: string) => (wrapper ? `${wrapper}/${file}` : file);

  // A folder the game or a mod type has, or a file that replaces one of the
  // game's own (not a readme that happens to share a name).
  const mirrors = inner.some((file) => {
    const [top, ...rest] = file.split("/");
    if (rest.length > 0) return isKnownTop(lower(top));
    return gameRootEntries.has(lower(top)) && !DOCUMENT_FILE.test(top);
  });
  if (mirrors) {
    return {
      files: inner.map((file) => ({ archive: strip(file), target: file })),
      skipped: [],
      recognised: true,
      description: wrapper
        ? `the folder ${wrapper} holds a game-folder layout`
        : "the archive is laid out like the game folder",
    };
  }

  const byLastSegment = new Map(
    definition.modTypes.map((rule) => [
      lower(modTypePath(rule).split("/").at(-1) ?? ""),
      rule,
    ])
  );
  const byExtension = definition.modTypes
    .flatMap((rule) =>
      (rule.extensions ?? []).map((extension) => ({
        extension: lower(extension),
        rule,
      }))
    )
    .toSorted((a, b) => b.extension.length - a.extension.length);
  const fallback =
    definition.modTypes.find((rule) => rule.isDefault) ??
    definition.modTypes[0];
  const folderName = modFolderName(modName);
  const into = (rule: ModTypeRule, rest: string) =>
    [modTypePath(rule), rule.perModFolder ? folderName : "", rest]
      .filter(Boolean)
      .join("/");

  let recognised = false;
  const placed = inner.map((file) => {
    const [top, ...rest] = file.split("/");
    const routed = rest.length > 0 ? byLastSegment.get(lower(top)) : undefined;
    if (routed) recognised = true;
    if (routed)
      return { archive: strip(file), target: into(routed, rest.join("/")) };
    const byType = byExtension.find(({ extension }) =>
      lower(file).endsWith(extension)
    )?.rule;
    if (byType) recognised = true;
    return {
      archive: strip(file),
      target: fallback ? into(byType ?? fallback, file) : file,
    };
  });
  return {
    files: placed,
    skipped: [],
    recognised,
    description: `loose files routed by ${definition.name}'s mod types${wrapper ? `, the folder ${wrapper} taken as the mod's name` : ""}`,
  };
};

/** Two tools that want Wine to load the same proxy DLL from the game folder. */
export const findProxyDllClash = (
  loaderDlls: string[],
  others: { tool: string; dll: string | null | undefined }[]
) => {
  const wanted = new Set(loaderDlls.map(lower));
  return (
    others.find(
      (other) => other.dll && wanted.has(lower(other.dll).replace(/\.dll$/, ""))
    ) ?? null
  );
};

/** Thunderstore's ecosystem schema, the parts Hydra reads. */
export interface ThunderstoreSchema {
  games: Record<
    string,
    {
      label?: string;
      r2modman?:
        | {
            meta?: { displayName?: string };
            distributions?: { platform: string; identifier: string }[];
            exeNames?: string[];
            packageIndex?: string;
            packageLoader?: string;
            gameInstanceType?: string;
            installRules?: {
              route: string;
              defaultFileExtensions?: string[];
              trackingMethod?: string;
              isDefaultLocation?: boolean;
            }[];
          }[]
        | null;
    }
  >;
  modloaderPackages?: {
    packageId: string;
    rootFolder?: string;
    loader: string;
  }[];
}

const THUNDERSTORE_LOADERS: Record<string, ModLoaderKind> = {
  bepinex: "bepinex",
  melonloader: "melonloader",
};

/** One definition per game Thunderstore lists, from its ecosystem schema. */
export const thunderstoreGameSupport = (
  schema: ThunderstoreSchema,
  fetchedAt: string
): GameSupportDefinition[] =>
  Object.entries(schema.games).flatMap(([label, game]) =>
    (game.r2modman ?? [])
      .filter((entry) => (entry.gameInstanceType ?? "game") === "game")
      .flatMap((entry): GameSupportDefinition[] => {
        const community =
          /\/c\/([^/]+)\//.exec(entry.packageIndex ?? "")?.[1] ?? label;
        const loaderKind = entry.packageLoader
          ? THUNDERSTORE_LOADERS[entry.packageLoader]
          : undefined;
        const steamAppIds = (entry.distributions ?? [])
          .filter((item) => item.platform === "steam")
          .map((item) => item.identifier);
        const exeNames = (entry.exeNames ?? [])
          .filter((name) => /\.exe$/i.test(name))
          .map(lower);
        if (steamAppIds.length === 0 && exeNames.length === 0) return [];
        const name = entry.meta?.displayName ?? label;
        return [
          {
            id: `thunderstore:${community}`,
            name,
            match: { steamAppIds, exeNames },
            modTypes: (entry.installRules ?? []).map((rule) => ({
              target: `game:${rule.route}`,
              extensions: rule.defaultFileExtensions?.length
                ? rule.defaultFileExtensions
                : undefined,
              isDefault: rule.isDefaultLocation || undefined,
              perModFolder: rule.trackingMethod === "subdir" || undefined,
            })),
            loader: loaderKind
              ? {
                  kind: loaderKind,
                  name: MOD_LOADERS[loaderKind].name,
                  package: {
                    kind: "thunderstore",
                    community,
                    packageIds: (schema.modloaderPackages ?? [])
                      .filter((item) => item.loader === entry.packageLoader)
                      .map((item) => item.packageId),
                  },
                }
              : undefined,
            unsupportedLoader:
              entry.packageLoader && !loaderKind
                ? entry.packageLoader
                : undefined,
            source: `Thunderstore ecosystem schema, community ${community} (fetched ${fetchedAt})`,
            origin: "thunderstore",
          },
        ];
      })
  );
