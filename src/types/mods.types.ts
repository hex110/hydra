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

export interface NexusGameMatch {
  id: number;
  domainName: string;
  name: string;
}

export interface GameMods {
  /** The folder mods are deployed into; null when the game has no executable. */
  gameFolder: string | null;
  mods: InstalledMod[];
  nexusGame: NexusGameMatch | null;
  /** Files a mod ships that a mod lower in the list also ships (it loses them). */
  overridden: Record<string, string[]>;
  /** FOMOD installers waiting for the user's choices. */
  pendingFomods: PendingFomodInstall[];
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

export type ModInstallStage = "requesting" | "downloading" | "installing";

export interface ModInstallProgress {
  shop: string;
  objectId: string;
  /** `nexus:<modId>:<fileId>` or `file:<name>`. */
  key: string;
  stage: ModInstallStage;
  progress: number | null;
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
  | "failed";

export type ModActionResult =
  | { ok: true }
  | { ok: false; error: ModActionErrorCode };
