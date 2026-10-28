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
