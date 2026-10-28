import type { GameShop } from "./game.types";

/** Where self-hosted save backups go; replaces Hydra Cloud when set. */
export type SaveStoreConfig =
  | { kind: "folder"; path: string }
  | { kind: "rclone"; remote: string };

/** What a save store holds and how much a cleanup would free. */
export interface SaveStoreUsage {
  games: number;
  versions: number;
  blobs: number;
  totalBytes: number;
  /** Old versions and unreferenced files a cleanup would delete. */
  reclaimableBytes: number;
  reclaimableVersions: number;
  reclaimableBlobs: number;
}

export interface SaveStoreCleanupResult {
  removedVersions: number;
  removedBlobs: number;
  freedBytes: number;
}

/** A device that syncs through the store, as the other devices see it. */
export interface SaveStoreDevice {
  id: string;
  hostname: string | null;
  platform: string | null;
  updatedAt: string;
  isThisDevice: boolean;
  games: number;
}

/** Another device's library as a source to import from. */
export interface CloudLibraryImportOption {
  deviceId: string;
  hostname: string | null;
  updatedAt: string;
  /** Games in that library. */
  games: number;
  /** Of those, the ones this library lacks. */
  newGames: number;
}

export interface CloudLibraryImportResult {
  imported: number;
}

/** Which games a manual save backup covers. */
export type ManualSaveBackupScope =
  | { kind: "launched" }
  | { kind: "recent"; days: number }
  | { kind: "all" };

export interface ManualSaveBackupGame {
  shop: GameShop;
  objectId: string;
  title: string;
}

export interface ManualSaveBackupProgress {
  done: number;
  total: number;
  title: string | null;
}

export interface ManualSaveBackupSummary {
  /** Games the scope matched. */
  total: number;
  uploaded: number;
  restored: number;
  unchanged: number;
  /** No save sync for it: sync off, no executable, no known save location. */
  skipped: number;
  failed: number;
  /** Both this device and the store changed the saves; the user picks in the game's save manager. */
  conflicts: ManualSaveBackupGame[];
  cancelled: boolean;
}
