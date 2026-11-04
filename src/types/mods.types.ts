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
  | { kind: "file"; fileName: string }
  /** Downloaded from where it is published (a loader's releases). */
  | { kind: "url"; url: string; fileName: string };

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
  /** The mod is (or ships) the game's mod loader. */
  loader?: InstalledModLoader;
  /** Its files go into the loader's folders: it does nothing without the loader. */
  needsLoader?: ModLoaderKind;
}

export type ModLoaderKind = "bepinex" | "melonloader";

/** A loader found in a mod's files. */
export interface InstalledModLoader {
  kind: ModLoaderKind;
  /** Proxy DLLs (without ".dll") Wine must load from the game folder. */
  nativeDlls: string[];
}

/** Where Hydra downloads a game's loader from. */
export type ModLoaderPackage =
  | { kind: "url"; url: string; version: string; fileName: string }
  | {
      kind: "thunderstore";
      community: string;
      /** Loader packages the community may use; the most downloaded wins. */
      packageIds: string[];
    };

export interface ModLoaderSupport {
  kind: ModLoaderKind;
  /** "BepInEx 6 (IL2CPP)". */
  name: string;
  package: ModLoaderPackage;
}

/** Where a kind of mod file goes. */
export interface ModTypeRule {
  /** "game:<path>" in the game folder ("prefix:<path>" comes with step 6). */
  target: string;
  /** Loose files with these extensions go here. */
  extensions?: string[];
  /** Loose files no other rule takes go here. */
  isDefault?: boolean;
  /** A mod's loose files go into a folder named after it, like r2modman. */
  perModFolder?: boolean;
}

/** What Hydra knows about modding one game. */
export interface GameSupportDefinition {
  id: string;
  name: string;
  match: {
    steamAppIds?: string[];
    nexusDomains?: string[];
    /** Lower-case file names. */
    exeNames?: string[];
  };
  modTypes: ModTypeRule[];
  loader?: ModLoaderSupport;
  /** A loader the game's mods use that Hydra can't install yet. */
  unsupportedLoader?: string;
  /** Where the facts came from. */
  source: string;
  /** "hydra": written by hand; "detected": read from the game's files. */
  origin: "hydra" | "thunderstore" | "detected";
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
export type ModGameSupport =
  | {
      /** No definition: files go into `modFolder` only. */
      kind: "fallback";
      /** Relative to the game folder; "" for the game folder itself. */
      modFolder: string;
      /** Where the folder came from: the mod folder table, or the game root. */
      source: "mod-folder-table" | "game-root";
    }
  | {
      kind: "definition";
      id: string;
      name: string;
      origin: GameSupportDefinition["origin"];
      source: string;
      /** Where loose mod files go, relative to the game folder. */
      modFolder: string;
      loader: {
        kind: ModLoaderKind;
        name: string;
        /** An enabled mod is the loader. */
        installed: boolean;
      } | null;
      unsupportedLoader: string | null;
    };

export interface GameMods {
  /** The folder mods are deployed into; null when the game has no executable. */
  gameFolder: string | null;
  blocker: ModsBlocker | null;
  support: ModGameSupport;
  playMode: ModPlayMode;
  /** The loader that starts the game modded: an enabled loader mod. */
  loader: { name: string; version: string | null } | null;
  /** Enabled mods need a loader that isn't installed. */
  loaderMissing: boolean;
  /** The mods are in the game folder; Play takes them out until Play (modded). */
  deployed: boolean;
  mods: InstalledMod[];
  nexusGame: NexusGameMatch | null;
  /** Files a mod ships that a mod lower in the list also ships (it loses them). */
  overridden: Record<string, string[]>;
  /** FOMOD installers waiting for the user's choices. */
  pendingFomods: PendingFomodInstall[];
  /** Mods waiting for the user to say where their files go. */
  pendingPlacements: PendingModPlacement[];
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
  /** `nexus:<modId>:<fileId>`, or `loader:<kind>` for a game's loader. */
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
  | "no-game-folder"
  | "proxy-dll-clash"
  | "no-loader-package";

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
  | "loader"
  | "load-order"
  | "placement-waiting"
  | "placement-chosen"
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

/** A top-level file or folder of a mod's archive, in the placement dialog. */
export interface ModPlacementEntry {
  name: string;
  isFolder: boolean;
  files: number;
}

/** Where one top-level entry goes, relative to the game folder. */
export interface ModPlacementChoice {
  entry: string;
  /** "folder": the folder itself; "contents": only what is inside it. */
  mode: "folder" | "contents" | "skip";
  target: string;
}

export type ModPlacementReason =
  | "contains-program"
  | "nothing-recognised"
  | "loose-in-game-folder"
  /** The user asked to place an installed mod again. */
  | "user";

export interface ModPlacementUncertainty {
  reason: ModPlacementReason;
  /** The files behind the reason (the programs), when there are any. */
  files: string[];
}

/** A mod waiting for the user to say where its files go. */
export interface PendingModPlacement {
  id: string;
  name: string;
  version: string | null;
  reason: ModPlacementReason;
  createdAt: number;
}

/** What the placement dialog shows. */
export interface PendingModPlacementDetails extends PendingModPlacement {
  entries: ModPlacementEntry[];
  /** Every file, relative to the archive, for the preview. */
  files: string[];
  /** Hydra's guess, preselected. */
  guess: ModPlacementChoice[];
  /** Folders to offer, relative to the game folder ("" is the game folder). */
  targets: string[];
  programs: string[];
  /** The mod's description from its Nexus page, as plain text. */
  description: string | null;
  /** The mod's Nexus page, to read the rest. */
  pageUrl: string | null;
}

/** One move Sort by dependencies makes, and why. */
export interface ModOrderChange {
  /** The mod that now loads first. */
  modName: string;
  beforeName: string;
  /** Where the fact came from: "its manifest.json Dependencies"… */
  reason: string;
}

/** The order Sort by dependencies proposes, applied only when the user agrees. */
export interface ModOrderProposal {
  /** Mod ids in the proposed order. */
  order: string[];
  changes: ModOrderChange[];
  /** Mods that depend on each other in a circle, left in their order. */
  cycles: string[][];
  unchanged: boolean;
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
