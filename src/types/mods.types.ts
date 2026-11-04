import type { GameShop } from "./game.types";
import type { PendingFomodInstall } from "./fomod.types";

export type ModSource =
  | {
      kind: "nexus";
      gameDomain: string;
      gameId: number;
      modId: number;
      fileId: number;
    }
  | { kind: "file"; fileName: string };

export interface InstalledMod {
  /** Hydra's id for the mod, also its staging folder's name. */
  id: string;
  name: string;
  version: string | null;
  source: ModSource;
  enabled: boolean;
  /**
   * Where the staged files go, relative to the game folder (`Mods`, `Data`,
   * or "" for the game folder itself).
   */
  deployRoot: string;
  /** Staged files, relative to the mod's staging folder, `/`-separated. */
  files: string[];
  installedAt: number;
  /** Set by an update check: a newer main file on Nexus. */
  update?: { fileId: number; version: string | null; name: string } | null;
  /** The archive looked like a FOMOD installer; its default layout was used. */
  fomod?: boolean;
  /** Installed through its FOMOD installer with options the user picked. */
  fomodChosen?: boolean;
  /** What the mod's Nexus page says it needs, read when it was installed. */
  requirements?: NexusModRequirement[];
}

/** A requirement listed on a Nexus mod page. */
export interface NexusModRequirement {
  /** The Nexus mod, for requirements on Nexus for the same game. */
  modId: number | null;
  name: string;
  /** A page outside Nexus (a tool such as SMAPI's site), or another game's mod. */
  url: string | null;
  notes: string | null;
}

/** A saved mod list: which mods are on, in which order. */
export interface ModProfile {
  id: string;
  name: string;
  entries: { modId: string; enabled: boolean }[];
}

export interface NexusGameMatch {
  id: number;
  domainName: string;
  name: string;
}

/** Why Hydra can't change a game's mods right now. */
export type ModsBlocker = "no-executable" | "game-running";

/** How Play starts a game that has mods: through its loader, or without. */
export type ModPlayMode = "modded" | "plain";

/** What Hydra knows about installing mods for a game. */
export interface ModGameSupport {
  /** "fallback": no definition, files go into `modFolder` only. */
  kind: "fallback";
  /** Relative to the game folder; "" for the game folder itself. */
  modFolder: string;
  /** Where the folder came from: the mod folder table, or the game root. */
  source: "mod-folder-table" | "game-root";
}

export interface GameMods {
  /** The folder mods are deployed into; null when the game has no executable. */
  gameFolder: string | null;
  blocker: ModsBlocker | null;
  support: ModGameSupport;
  playMode: ModPlayMode;
  /** The loader that starts the game modded; none until loaders exist. */
  loader: { name: string; version: string | null } | null;
  mods: InstalledMod[];
  nexusGame: NexusGameMatch | null;
  /** Files a mod ships that a mod lower in the list also ships (it loses them). */
  overridden: Record<string, string[]>;
  /** FOMOD installers waiting for the user's choices. */
  pendingFomods: PendingFomodInstall[];
  profiles: { id: string; name: string }[];
  activeProfileId: string | null;
}

export interface NexusMod {
  modId: number;
  name: string;
  summary: string | null;
  version: string | null;
  author: string | null;
  pictureUrl: string | null;
  downloads: number;
  endorsements: number;
  updatedAt: string | null;
  adult: boolean;
}

export type NexusModSort = "downloads" | "endorsements" | "updated";

export interface NexusModSearchResult {
  mods: NexusMod[];
  totalCount: number;
}

export type NexusFileCategory =
  | "MAIN"
  | "OPTIONAL"
  | "UPDATE"
  | "MISCELLANEOUS"
  | "OLD_VERSION"
  | "ARCHIVED"
  | "DELETED";

export interface NexusModFile {
  fileId: number;
  name: string;
  version: string | null;
  category: NexusFileCategory;
  sizeInBytes: number | null;
  uploadedAt: number;
  description: string | null;
}

export type ModDownloadState =
  | "waiting-torbox"
  | "downloading"
  /** A manual download from Nexus the user has to start (step 8). */
  | "waiting-for-you"
  | "installing"
  | "failed"
  | "done";

/** One mod download in the Downloads queue. */
export interface ModDownload {
  id: string;
  shop: GameShop;
  objectId: string;
  gameTitle: string;
  /** `nexus:<modId>:<fileId>`. */
  key: string;
  modName: string;
  fileName: string;
  version: string | null;
  state: ModDownloadState;
  /** 0–1 while downloading, when the size is known. */
  progress: number | null;
  bytesLoaded: number | null;
  bytesTotal: number | null;
  error: ModActionErrorCode | null;
  /** The error's message, for the row's hint and the activity log. */
  errorMessage: string | null;
  /** Installed into a FOMOD installer that waits for options. */
  waitsForOptions: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ModInstallErrorCode =
  | "no-torbox"
  | "torbox-failed"
  | "download-failed"
  | "extract-failed"
  | "empty-archive"
  | "no-game-folder";

export type ModActionErrorCode =
  | ModInstallErrorCode
  | "game-running"
  | "not-found"
  | "cancelled"
  | "failed";

export type ModActivityKind =
  | "download-requested"
  | "download-finished"
  | "download-failed"
  | "install-plan"
  | "installed"
  | "fomod-waiting"
  | "deploy"
  | "undeploy"
  | "conflicts"
  | "enabled"
  | "disabled"
  | "moved"
  | "removed"
  | "profile"
  | "nexus-match"
  | "play-mode"
  | "launch"
  | "save-backup"
  | "error";

/** One line of a game's `activity.jsonl`. Never holds tokens or signed URLs. */
export interface ModActivityEntry {
  at: string;
  kind: ModActivityKind;
  /** Hydra's mod id, when the entry is about one mod. */
  modId?: string;
  modName?: string;
  /** A short sentence a person reads. */
  message: string;
  /** Structured details: ids, counts, paths, the rule that placed a file. */
  details?: Record<string, unknown>;
}

/** What Settings → Mods shows. */
export interface ModsOverview {
  storagePath: string;
  storageBytes: number;
  games: number;
  torBox: {
    connected: boolean;
    /** Nexus links TorBox still allows today; null when it could not be read. */
    nexusLinksLeft: number | null;
    nexusLinksLimit: number | null;
  };
  isNxmHandler: boolean;
}

export type ModFolderKind = "staging" | "game-mods" | "store";

export type ModActionResult =
  | { ok: true }
  | { ok: false; error: ModActionErrorCode };
