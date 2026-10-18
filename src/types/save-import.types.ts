/**
 * Where saves and achievements can be imported from. Every kind produces the
 * same snapshot shape as Hydra Cloud, so future cloud sources plug into the
 * same import.
 */
export type SaveImportSourceKind = "windows-install" | "hydra-launcher";

export interface SaveImportSourceInfo {
  id: string;
  kind: SaveImportSourceKind;
  /** e.g. "Windows on /mnt/Windows (moonlight)". */
  label: string;
  /** Windows drive root, or upstream Hydra's data folder. */
  rootPath: string;
  /** Windows user profile name, for Windows installs; empty otherwise. */
  userProfile: string;
  /** Detected automatically rather than added by the user. */
  detected: boolean;
  enabled: boolean;
}

/** A Windows drive or folder the user added as an import source. */
export interface SaveImportCustomSource {
  rootPath: string;
  userProfile: string;
}

export type SaveImportError =
  | "not-found"
  | "not-windows-game"
  | "prefix-not-ready"
  | "source-not-found"
  | "failed";

export type SaveImportMode = "ask" | "automatic" | "never";

export type SaveImportFileAction =
  | "create"
  | "replace"
  | "identical"
  /** The game's copy is newer than the source's; kept unless forced. */
  | "keep-newer";

export interface SaveImportFilePreview {
  rawPath: string;
  relativePath: string;
  sizeBytes: number;
  lastModifiedAt: string;
  action: SaveImportFileAction;
  targetPath: string;
}

export interface SaveImportPreview {
  sourceId: string;
  sourceLabel: string;
  files: SaveImportFilePreview[];
  /** Files the restore could not map into the game's prefix. */
  unmappedFiles: number;
  /** Unlocked achievements found in emulator files at the source. */
  achievements: number;
  newestFileAt: string | null;
}

export interface SaveImportOptions {
  /** Replace the game's files even when they are newer than the source's. */
  overwriteNewer?: boolean;
  includeAchievements?: boolean;
}

export interface SaveImportResult {
  sourceId: string;
  importedFiles: number;
  keptNewerFiles: number;
  failedFiles: number;
  achievements: number;
  /** Folder holding the game files the import replaced, if any. */
  backupPath: string | null;
}

/** What Hydra found or did for a game, stored on the game. */
export interface GameSaveImportState {
  /** A source has saves the game does not have yet; shown until imported or dismissed. */
  pending: {
    sourceId: string;
    sourceLabel: string;
    files: number;
    achievements: number;
    newestFileAt: string | null;
  } | null;
  lastImport: {
    sourceId: string;
    at: string;
    files: number;
    achievements: number;
  } | null;
  dismissedAt?: string;
}

export interface SaveImportBulkProgress {
  status: "running" | "completed";
  processed: number;
  total: number;
  importedGames: number;
  failedGames: number;
}
