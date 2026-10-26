/** Where self-hosted save backups go; replaces Hydra Cloud when set. */
export type SaveStoreConfig =
  | { kind: "folder"; path: string }
  | { kind: "rclone"; remote: string };
