import type { NexusModFile } from "../types/mods.types.js";

/**
 * Where a game loads mods from, relative to its folder, by Nexus game domain.
 * Games without an entry take mods in their own folder. The values follow
 * the Vortex game extensions.
 */
export const MOD_FOLDERS: Record<string, string> = {
  stardewvalley: "Mods",
  skyrimspecialedition: "Data",
  skyrim: "Data",
  enderalspecialedition: "Data",
  fallout4: "Data",
  falloutnv: "Data",
  fallout3: "Data",
  oblivion: "Data",
  morrowind: "Data Files",
  starfield: "Data",
  valheim: "BepInEx/plugins",
  terraria: "",
  cyberpunk2077: "",
  witcher3: "Mods",
  bladeandsorcery: "BladeAndSorcery_Data/StreamingAssets/Mods",
  mountandblade2bannerlord: "Modules",
  darkestdungeon: "mods",
  hollowknight: "hollow_knight_Data/Managed/Mods",
  eldenring: "",
  monsterhunterworld: "",
  monsterhunterrise: "",
  residentevilvillage: "",
  dragonsdogma2: "",
  kingdomcomedeliverance: "Mods",
  kingdomcomedeliverance2: "Mods",
  subnautica: "QMods",
  rimworld: "Mods",
  xcom2: "XComGame/Mods",
};

export const getModFolder = (gameDomain: string | null | undefined) =>
  (gameDomain && MOD_FOLDERS[gameDomain]) ?? "";

/** Folders a Bethesda `Data` mod ships at its top level. */
const DATA_FOLDER_ENTRIES = new Set([
  "meshes",
  "textures",
  "scripts",
  "interface",
  "sound",
  "music",
  "skse",
  "f4se",
  "nvse",
  "obse",
  "sfse",
  "materials",
  "strings",
  "seq",
  "shadersfx",
  "video",
  "lodsettings",
  "grass",
  "calientetools",
  "netscriptframework",
]);

const DATA_FILE = /\.(esp|esm|esl|bsa|ba2)$/i;

const normalize = (filePath: string) =>
  filePath.replaceAll("\\", "/").replace(/^\.\/+/, "");

const topLevel = (files: string[]) => [
  ...new Set(files.map((file) => normalize(file).split("/")[0])),
];

/** Every file sits in one folder that is not itself a game folder. */
const singleWrapper = (files: string[]) => {
  const tops = topLevel(files);
  if (tops.length !== 1) return null;
  const top = tops[0];
  return files.every((file) => normalize(file).startsWith(`${top}/`))
    ? top
    : null;
};

export interface ModLayout {
  /** A leading folder of the archive left out when deploying. */
  stripPrefix: string;
  /** Where the rest goes, relative to the game folder. */
  deployRoot: string;
}

/**
 * How an unpacked archive lines up with the game. Archives are made in many
 * ways: with or without the mod folder (`Mods/Name/…` or `Name/…`), inside a
 * wrapper folder named after the mod, or mirroring the game folder.
 */
export const resolveModLayout = ({
  files,
  modFolder,
  gameRootEntries,
}: {
  files: string[];
  modFolder: string;
  /** Lower-case names of the files and folders in the game folder. */
  gameRootEntries: Set<string>;
}): ModLayout => {
  const lower = (value: string) => value.toLowerCase();
  const modFolderTop = lower(modFolder.split("/")[0] ?? "");
  const tops = topLevel(files).map(lower);

  // The archive mirrors the game folder (it has the mod folder or a folder
  // the game has at its top).
  if (tops.some((top) => top === modFolderTop && modFolderTop !== "")) {
    return { stripPrefix: "", deployRoot: "" };
  }
  if (
    modFolder === "" &&
    tops.some((top) => gameRootEntries.has(top) && !DATA_FILE.test(top))
  ) {
    return { stripPrefix: "", deployRoot: "" };
  }

  const wrapper = singleWrapper(files);
  if (wrapper) {
    const inner = files.map((file) =>
      normalize(file).slice(wrapper.length + 1)
    );
    const innerTops = topLevel(inner).map(lower);
    // `Name/Mods/…` or `Name/bin/…`: a wrapper around a game-folder layout.
    if (
      (modFolderTop !== "" && innerTops.includes(modFolderTop)) ||
      (modFolder === "" && innerTops.some((top) => gameRootEntries.has(top)))
    ) {
      return { stripPrefix: wrapper, deployRoot: "" };
    }
    // `Name/meshes/…` for a Data mod: the wrapper is just the mod's name.
    if (
      lower(modFolder) === "data" &&
      innerTops.some(
        (top) => DATA_FOLDER_ENTRIES.has(top) || DATA_FILE.test(top)
      )
    ) {
      return { stripPrefix: wrapper, deployRoot: modFolder };
    }
  }

  // Loose content for the mod folder: a Stardew mod's `Name/manifest.json`
  // stays in its own folder under `Mods`, Data content goes into `Data`.
  return { stripPrefix: "", deployRoot: modFolder };
};

export const isFomodArchive = (files: string[]) =>
  files.some((file) =>
    /(^|\/)fomod\/moduleconfig\.xml$/i.test(normalize(file))
  );

export interface DeployableMod {
  id: string;
  enabled: boolean;
  deployRoot: string;
  files: string[];
}

export interface DeploymentPlan {
  /** Target path (relative to the game folder) → the mod and file it comes from. */
  files: Map<string, { target: string; modId: string; file: string }>;
  /** Per mod, the targets a mod lower in the list takes over. */
  overridden: Record<string, string[]>;
}

const joinTarget = (root: string, file: string) =>
  [root, normalize(file)].filter(Boolean).join("/");

/**
 * Which mod provides each file. Later mods in the list win, like Mod
 * Organizer's order; paths compare case-insensitively, as Windows games do.
 */
export const planDeployment = (mods: DeployableMod[]): DeploymentPlan => {
  const files: DeploymentPlan["files"] = new Map();
  const overridden: Record<string, string[]> = {};

  for (const mod of mods) {
    if (!mod.enabled) continue;
    for (const file of mod.files) {
      const target = joinTarget(mod.deployRoot, file);
      const key = target.toLowerCase();
      const previous = files.get(key);
      if (previous) {
        (overridden[previous.modId] ??= []).push(previous.target);
      }
      files.set(key, { target, modId: mod.id, file: normalize(file) });
    }
  }

  return { files, overridden };
};

export const nexusFilePageUrl = (
  gameDomain: string,
  modId: number,
  fileId: number
) =>
  `https://www.nexusmods.com/${gameDomain}/mods/${modId}?tab=files&file_id=${fileId}`;

export const nexusModPageUrl = (gameDomain: string, modId: number) =>
  `https://www.nexusmods.com/${gameDomain}/mods/${modId}`;

/** `nxm://<game>/mods/<mod>/files/<file>?key=…` from Nexus's download button. */
export const parseNxmLink = (link: string) => {
  const match =
    /^nxm:\/\/([^/]+)\/mods\/(\d+)\/files\/(\d+)/i.exec(link.trim()) ?? null;
  if (!match) return null;
  return {
    gameDomain: match[1].toLowerCase(),
    modId: Number(match[2]),
    fileId: Number(match[3]),
  };
};

/** The newest main file, when it is not the one installed. */
export const findModUpdate = <
  T extends Pick<NexusModFile, "fileId" | "category" | "uploadedAt">,
>(
  files: T[],
  installedFileId: number
): T | null => {
  const installed = files.find((file) => file.fileId === installedFileId);
  const newest = files
    .filter((file) => file.category === "MAIN")
    .toSorted((a, b) => b.uploadedAt - a.uploadedAt)[0];
  if (!newest || newest.fileId === installedFileId) return null;
  if (installed && newest.uploadedAt <= installed.uploadedAt) return null;
  return newest;
};
