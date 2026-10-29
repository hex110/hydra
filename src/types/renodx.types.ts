export type RenoDxModStatus = "stable" | "beta" | "experimental";

export type RenoDxModCategory = "game" | "engine" | "related";

export type RenoDxArchitecture = "x64" | "x86";

export interface RenoDxArtifact {
  /** File name, such as `renodx-cp2077.addon64`. */
  name: string;
  arch: RenoDxArchitecture;
  /** Absolute download URL. */
  url: string;
  size: number;
}

export interface RenoDxMod {
  id: string;
  title: string;
  /** Set when a game has several mods, such as "Alternate". */
  variant: string | null;
  /** Null for mods the catalogue does not rate. */
  status: RenoDxModStatus | null;
  category: RenoDxModCategory;
  notes: string[];
  artifacts: RenoDxArtifact[];
}

export interface RenoDxGameEntry {
  id: string;
  title: string;
  aliases: string[];
  steamAppId: number | null;
  mods: RenoDxMod[];
}

/** The proxy DLL ReShade loads as, by the graphics API of the game. */
export type ReShadeProxyDll = "dxgi.dll" | "d3d9.dll" | "opengl32.dll";

/** Written next to the installed files as `.hydra-renodx.json`. */
export interface RenoDxManifest {
  reShadeVersion: string;
  /** The file ReShade was copied to, relative to the install directory. */
  reShadeFile: string;
  /** Set when ReShade loads through OptiScaler instead of a proxy DLL of its own. */
  loadedByOptiScaler: boolean;
  modId: string;
  addonFile: string;
  addonVersion: string;
  installedAt: string;
  /** Files Hydra placed, relative to the install directory. */
  files: string[];
  /** Directories Hydra created, deepest first. */
  directories: string[];
  /** Game files that were replaced, saved under the backup directory. */
  backups: string[];
}

/** Stored on the game so the launcher can apply the DLL override without disk access. */
export interface GameRenoDxInstallation {
  directory: string;
  modId: string;
  modTitle: string;
  reShadeVersion: string;
  addonVersion: string;
  /** The DLL Wine must load natively, or null when OptiScaler loads ReShade. */
  proxyDll: ReShadeProxyDll | null;
  installedAt: string;
}

export type RenoDxUnavailableReason =
  /** The game has no executable, or it is not a Windows one. */
  | "not-windows"
  /** Steam or Epic owns the game's files. */
  | "other-launcher"
  /** The catalogue has no mod for this game. */
  | "no-mod"
  /** Only beta or experimental mods exist and they are turned off. */
  | "prerelease-only"
  /** The mod has no download for this game's architecture. */
  | "no-artifact"
  /** The game only renders through Vulkan, which ReShade cannot hook here. */
  | "unsupported-api"
  /** The catalogue could not be loaded and none is cached. */
  | "no-catalogue";

export interface RenoDxModChoice {
  mod: RenoDxMod;
  artifact: RenoDxArtifact;
}

export type ProxyDllKindName =
  | "optiscaler"
  | "reshade"
  | "special-k"
  | "enb"
  | "dxvk"
  | "unknown";

export interface RenoDxProxyConflict {
  fileName: string;
  kind: ProxyDllKindName;
}

export interface GameRenoDxStatus {
  installDirectory: string | null;
  installation: GameRenoDxInstallation | null;
  /** The mod Hydra would install, or null with the reason in `unavailable`. */
  mod: {
    title: string;
    variant: string | null;
    status: RenoDxModStatus | null;
    notes: string[];
    addonFile: string;
  } | null;
  unavailable: RenoDxUnavailableReason | null;
  /** The DLL ReShade would load as; null when OptiScaler loads it or none fits. */
  proxyDll: ReShadeProxyDll | null;
  /** A file is already using that name and was not installed by Hydra. */
  conflict: RenoDxProxyConflict | null;
  /** ReShade or RenoDX files that Hydra did not install are present. */
  externallyManaged: boolean;
  /** Files of Hydra's installation that were removed outside Hydra. */
  missingFiles: string[];
  autoInstallDisabled: boolean;
  /** The anti-cheat found in the game folder, if any. */
  antiCheat: string | null;
  /** A newer ReShade or a changed add-on is available. */
  updateAvailable: boolean;
  latestReShadeVersion: string | null;
}

export type RenoDxAutoInstallOutcome =
  | "installed"
  | "auto-install-off"
  | "already-installed"
  | "opted-out"
  | RenoDxUnavailableReason
  | "external"
  | "conflict"
  /** An anti-cheat is in the game folder. */
  | "anti-cheat"
  /** OptiScaler's compatibility list says the game does not work with such mods. */
  | "blocked";

export interface RenoDxOverview {
  catalogueGames: number;
  catalogueUpdatedAt: string | null;
  latestReShadeVersion: string | null;
  installedGames: number;
  outdatedGames: number;
  cacheSizeInBytes: number;
}

export type RenoDxBulkMode = "install-supported" | "update-installed";

export interface RenoDxBulkProgress {
  status: "running" | "completed";
  processed: number;
  total: number;
  installed: number;
  failed: number;
}
