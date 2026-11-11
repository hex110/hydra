import type { FileFingerprint } from "./level.types";
/** Written next to the installed files as `.hydra-widescreen-patch.json`. */
export interface WidescreenPatchManifest {
  patchId: string;
  version: string;
  installedAt: string;
  /** Files Hydra placed, relative to the install directory. */
  files: string[];
  /** Directories Hydra created, deepest first. */
  directories: string[];
  /** Game files that were replaced, saved under the backup directory. */
  backups: string[];
  /** What Hydra put at each backed-up path, to notice it being replaced. */
  fingerprints?: Record<string, FileFingerprint>;
}

/** Stored on the game so the launcher can apply the DLL override without disk access. */
export interface GameWidescreenPatchInstallation {
  directory: string;
  patchId: string;
  version: string;
  /** Proxy DLL the patch loads through, without `.dll`. */
  nativeDll: string;
  installedAt: string;
}

export interface GameWidescreenPatchStatus {
  /** The patch Hydra has for this game; null when it has none. */
  patch: { id: string; name: string; configFile: string } | null;
  installDirectory: string | null;
  installation: GameWidescreenPatchInstallation | null;
  /** A file the patch needs to place that the game or another tool owns. */
  conflict: { fileName: string } | null;
  /** Patch files that were removed from the game folder since. */
  missingFiles: string[];
}
