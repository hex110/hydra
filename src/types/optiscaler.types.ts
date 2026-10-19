export type OptiScalerProxyDll =
  | "dxgi.dll"
  | "winmm.dll"
  | "version.dll"
  | "dbghelp.dll"
  | "d3d12.dll"
  | "wininet.dll"
  | "winhttp.dll";

export type OptiScalerChannel = "stable" | "nightly";

export type OptiScalerCompatibilityStatus = "working" | "not-working";

export interface OptiScalerCompatibilityEntry {
  title: string;
  status: OptiScalerCompatibilityStatus;
  upscalerInputs: string;
  optiPatcherSupported: boolean;
  notes: string;
  wikiSlug: string | null;
}

/** Written next to the installed files as `.hydra-optiscaler.json`. */
export interface OptiScalerManifest {
  version: string;
  channel: OptiScalerChannel;
  proxyDll: OptiScalerProxyDll;
  optiPatcherVersion: string | null;
  installedAt: string;
  /** Files Hydra placed, relative to the install directory. */
  files: string[];
  /** Directories Hydra created, deepest first. */
  directories: string[];
  /** Game files that were replaced, saved under the backup directory. */
  backups: string[];
}

/** Stored on the game so the launcher can apply the DLL override without disk access. */
export interface GameOptiScalerInstallation {
  directory: string;
  version: string;
  proxyDll: OptiScalerProxyDll;
  installedAt: string;
}

export type OptiScalerEligibilityReason =
  | "native-upscaler"
  | "compatibility-list";

export type OptiScalerAutoInstallOutcome =
  | "installed"
  | "auto-install-off"
  | "already-installed"
  | "opted-out"
  | "not-windows"
  | "other-launcher"
  | "external"
  | "blocked"
  | "not-eligible";

export interface OptiScalerEligibility {
  eligible: boolean;
  reasons: OptiScalerEligibilityReason[];
  upscalerLibraries: string[];
  compatibility: OptiScalerCompatibilityEntry | null;
  /** The compatibility list reports the game as not working (usually anti-cheat). */
  blocked: boolean;
}

export interface GameOptiScalerStatus {
  installDirectory: string | null;
  installation: GameOptiScalerInstallation | null;
  /** OptiScaler files that Hydra did not install are present. */
  externallyManaged: boolean;
  /** Files of Hydra's installation that were removed outside Hydra. */
  missingFiles: string[];
  /** Wrappers in the launch command that manage OptiScaler files themselves. */
  conflictingWrappers: string[];
  eligibility: OptiScalerEligibility | null;
  autoInstallDisabled: boolean;
  latestVersion: string | null;
}

export interface OptiScalerOverview {
  latestVersion: string | null;
  cachedVersions: string[];
  cacheSizeInBytes: number;
  lastCheckedAt: string | null;
  compatibilityListUpdatedAt: string | null;
  compatibilityListSize: number;
  installedGames: number;
  outdatedGames: number;
}

export type OptiScalerBulkStatus = "running" | "completed";

export interface OptiScalerBulkProgress {
  status: OptiScalerBulkStatus;
  processed: number;
  total: number;
  installed: number;
  failed: number;
}
