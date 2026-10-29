import type {
  ReShadeProxyDll,
  RenoDxArchitecture,
  RenoDxArtifact,
  RenoDxGameEntry,
  RenoDxMod,
  RenoDxModCategory,
  RenoDxModChoice,
  RenoDxModStatus,
  RenoDxUnavailableReason,
  UserPreferences,
} from "@types";
import { isSameTitle } from "./title-matching.js";

const RENODX_RELEASES_URL =
  "https://github.com/clshortfuse/renodx/releases/download/";
export const RENODX_SNAPSHOT_URL = `${RENODX_RELEASES_URL}snapshot/`;
export const RENODX_INDEX_URL = `${RENODX_SNAPSHOT_URL}games-index.json`;

export const RENODX_MANIFEST_FILE = ".hydra-renodx.json";
export const RENODX_BACKUP_DIRECTORY = ".hydra-renodx-backup";

export const RESHADE_PROXY_DLLS: ReShadeProxyDll[] = [
  "dxgi.dll",
  "d3d9.dll",
  "opengl32.dll",
];

const MOD_STATUSES: RenoDxModStatus[] = ["stable", "beta", "experimental"];
const MOD_CATEGORIES: RenoDxModCategory[] = ["game", "engine", "related"];

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const parseArtifact = (value: unknown): RenoDxArtifact | null => {
  if (!isObject(value)) return null;
  const name = asString(value.name);
  const url = asString(value.url) ?? asString(value.path);
  const arch = value.arch === "x86" || value.arch === "x64" ? value.arch : null;
  if (!name || !url || !arch) return null;

  // Add-ons are plain files in RenoDX's own releases; nothing else is fetched.
  if (!/^[\w.-]+\.addon(64|32)$/i.test(name)) return null;
  let resolved: string;
  try {
    resolved = new URL(url, RENODX_SNAPSHOT_URL).toString();
  } catch {
    return null;
  }
  if (!resolved.startsWith(RENODX_RELEASES_URL)) return null;

  return {
    name,
    arch,
    url: resolved,
    size: typeof value.size === "number" ? value.size : 0,
  };
};

const parseMod = (value: unknown): RenoDxMod | null => {
  if (!isObject(value)) return null;
  const id = asString(value.id);
  if (!id) return null;

  const status = MOD_STATUSES.find((candidate) => candidate === value.status);
  const category = MOD_CATEGORIES.find(
    (candidate) => candidate === value.category
  );

  return {
    id,
    title: asString(value.title) ?? id,
    variant: asString(value.variant),
    status: status ?? null,
    category: category ?? "related",
    notes: Array.isArray(value.notes)
      ? value.notes.filter((note): note is string => typeof note === "string")
      : [],
    artifacts: Array.isArray(value.artifacts)
      ? value.artifacts
          .map(parseArtifact)
          .filter((artifact): artifact is RenoDxArtifact => !!artifact)
      : [],
  };
};

const parseGame = (value: unknown): RenoDxGameEntry | null => {
  if (!isObject(value)) return null;
  const id = asString(value.id);
  const title = asString(value.title);
  if (!id || !title || !Array.isArray(value.mods)) return null;

  const steamAppId =
    typeof value.steam_appid === "number" && value.steam_appid > 0
      ? value.steam_appid
      : null;

  return {
    id,
    title,
    aliases: Array.isArray(value.aliases)
      ? value.aliases.filter(
          (alias): alias is string => typeof alias === "string"
        )
      : [],
    steamAppId,
    mods: value.mods.map(parseMod).filter((mod): mod is RenoDxMod => !!mod),
  };
};

/**
 * Reads RenoDX's `games-index.json`. Null when the file is not the format
 * Hydra knows, so a changed format installs nothing instead of the wrong thing.
 */
export const parseRenoDxIndex = (text: string): RenoDxGameEntry[] | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(parsed) || !Array.isArray(parsed.games)) return null;

  const games = parsed.games
    .map(parseGame)
    .filter((game): game is RenoDxGameEntry => !!game);
  const downloadable = games.some((game) =>
    game.mods.some((mod) => mod.artifacts.length > 0)
  );
  return downloadable ? games : null;
};

export interface RenoDxGameQuery {
  /** The Steam app id, when the game is a Steam game. */
  steamAppId: number | null;
  title: string;
}

/** The catalogue entry for a game: by Steam app id, else by title or alias. */
export const findRenoDxGame = (
  entries: RenoDxGameEntry[],
  { steamAppId, title }: RenoDxGameQuery
): RenoDxGameEntry | null => {
  if (steamAppId !== null) {
    const byId = entries.find((entry) => entry.steamAppId === steamAppId);
    if (byId) return byId;
  }

  return (
    entries.find(
      (entry) =>
        isSameTitle(entry.title, title) ||
        entry.aliases.some((alias) => isSameTitle(alias, title))
    ) ?? null
  );
};

/** Lower ranks are preferred: the plain mod, then the more settled status. */
const STATUS_RANK = { stable: 0, null: 1, beta: 2, experimental: 3 } as const;

const rankMod = (mod: RenoDxMod) =>
  (mod.variant ? 10 : 0) + STATUS_RANK[mod.status ?? "null"];

export interface RenoDxChoiceOptions {
  /** Of the game's executable; unknown picks the 64-bit add-on when there is one. */
  architecture: RenoDxArchitecture | null;
  includePrerelease: boolean;
}

/**
 * The mod to install for a game, or why there is none. Only game-specific
 * mods count; the generic engine add-ons are not offered. Unrated mods are
 * offered like stable ones, since the catalogue only leaves the rating out.
 */
export const chooseRenoDxMod = (
  entry: RenoDxGameEntry,
  { architecture, includePrerelease }: RenoDxChoiceOptions
): RenoDxModChoice | { reason: RenoDxUnavailableReason } => {
  const gameMods = entry.mods.filter(
    (mod) => mod.category === "game" && mod.artifacts.length > 0
  );
  if (gameMods.length === 0) return { reason: "no-mod" };

  const offered = gameMods.filter(
    (mod) => includePrerelease || mod.status === null || mod.status === "stable"
  );
  if (offered.length === 0) return { reason: "prerelease-only" };

  const wanted = architecture ?? "x64";
  const ranked = [...offered].sort((a, b) => rankMod(a) - rankMod(b));
  for (const mod of ranked) {
    const artifact =
      mod.artifacts.find((candidate) => candidate.arch === wanted) ??
      (architecture === null ? mod.artifacts[0] : undefined);
    if (artifact) return { mod, artifact };
  }
  return { reason: "no-artifact" };
};

export const isRenoDxModChoice = (
  value: RenoDxModChoice | { reason: RenoDxUnavailableReason }
): value is RenoDxModChoice => "mod" in value;

export interface ReShadeApis {
  vulkan: boolean;
  direct3d9: boolean;
  dxgi: boolean;
  opengl: boolean;
}

/**
 * The name ReShade loads as for a game's graphics API: dxgi.dll for Direct3D
 * 10 to 12, d3d9.dll, opengl32.dll. Null for a game that only uses Vulkan.
 * A game whose API could not be told is assumed to be DirectX, which is what
 * RenoDX's mods are written for.
 */
export const chooseReShadeProxyDll = (
  apis: ReShadeApis | null
): ReShadeProxyDll | null => {
  if (!apis) return "dxgi.dll";
  if (apis.dxgi) return "dxgi.dll";
  if (apis.direct3d9) return "d3d9.dll";
  if (apis.opengl) return "opengl32.dll";
  return apis.vulkan ? null : "dxgi.dll";
};

export interface ReShadeDownload {
  version: string;
  /** Path on reshade.me, such as `downloads/ReShade_Setup_6.8.0_Addon.exe`. */
  path: string;
}

/** The newest add-on installer linked from reshade.me's front page. */
export const parseLatestReShadeDownload = (
  html: string
): ReShadeDownload | null => {
  let latest: ReShadeDownload | null = null;

  for (const match of html.matchAll(
    /downloads\/ReShade_Setup_(\d+(?:\.\d+)*)_Addon\.exe/gi
  )) {
    const version = match[1];
    if (!latest || compareVersions(version, latest.version) > 0) {
      latest = { version, path: match[0] };
    }
  }
  return latest;
};

export const compareVersions = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true });

export interface RenoDxSettings {
  autoInstall: boolean;
  includePrerelease: boolean;
  enableHdrRules: boolean;
}

export const resolveRenoDxSettings = (
  preferences: UserPreferences | null | undefined
): RenoDxSettings => ({
  autoInstall: preferences?.renoDxAutoInstall === true,
  includePrerelease: preferences?.renoDxIncludePrerelease === true,
  enableHdrRules: preferences?.renoDxEnableHdrRules !== false,
});

/** Names anti-cheat systems leave in a game folder, with what to call them. */
const ANTI_CHEAT_FILES: { pattern: RegExp; name: string }[] = [
  { pattern: /^easyanticheat/i, name: "Easy Anti-Cheat" },
  { pattern: /^eac_?launcher/i, name: "Easy Anti-Cheat" },
  { pattern: /^(battleye|be_?service)/i, name: "BattlEye" },
  { pattern: /^(vgc|vgk)\./i, name: "Vanguard" },
  { pattern: /^(faceitclient|faceit)/i, name: "FACEIT" },
  { pattern: /^(npggnt|gameguard|nprotect)/i, name: "GameGuard" },
  { pattern: /^(eaanticheat|ea_?anticheat)/i, name: "EA Javelin" },
];

/** The anti-cheat a list of file and folder names points to, or null. */
export const findAntiCheat = (names: string[]): string | null => {
  for (const name of names) {
    const match = ANTI_CHEAT_FILES.find(({ pattern }) => pattern.test(name));
    if (match) return match.name;
  }
  return null;
};
