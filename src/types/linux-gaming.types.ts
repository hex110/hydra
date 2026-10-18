export type ProtonFlavor = "ge-proton" | "proton-cachyos";

export interface ProtonRelease {
  flavor: ProtonFlavor;
  tag: string;
  publishedAt: string;
  /** Folder name the archive extracts to. */
  directoryName: string;
  downloadUrl: string;
  checksumUrl: string | null;
  sizeInBytes: number;
}

export interface ManagedProtonBuild {
  flavor: ProtonFlavor;
  tag: string;
  path: string;
  installedAt: string;
}

export interface ProtonFlavorOverview {
  flavor: ProtonFlavor;
  latest: ProtonRelease | null;
  releases: ProtonRelease[];
  /** Builds Hydra installed. */
  installed: ManagedProtonBuild[];
  autoUpdate: boolean;
  checkedAt: string | null;
  error: string | null;
}

export interface ProtonInstallProgress {
  flavor: ProtonFlavor;
  tag: string;
  stage: "downloading" | "verifying" | "extracting" | "done" | "failed";
  progress: number;
  error?: string;
}

export interface GamescopeSettings {
  /** Output (window) size; the game renders at this size unless set below. */
  width?: number | null;
  height?: number | null;
  /** Size the game renders at, upscaled to the output size. */
  gameWidth?: number | null;
  gameHeight?: number | null;
  /** Frame limit (`-r`). */
  fpsLimit?: number | null;
  hdr?: boolean;
  fullscreen?: boolean;
  /** Extra gamescope arguments, before `--`. */
  extraArgs?: string;
}

export type MangoHudPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface MangoHudSettings {
  position: MangoHudPosition;
  /** MangoHud parameters shown, such as `fps`, `frame_timing`, `gpu_stats`. */
  metrics: string[];
  /** 0 or null for no limit. */
  fpsLimit: number | null;
  horizontal: boolean;
  /** A line naming the active upscaler and frame generation (OptiScaler games). */
  showUpscaler: boolean;
  /** Raw `key=value` lines added to the config. */
  extra: string;
}

/** What a launch rule does besides adding launch options. */
export interface LaunchRuleActions {
  /** A Proton build path, or "<flavor>:latest". */
  proton?: string | null;
  mangohud?: boolean;
  gamemode?: boolean;
  gamescope?: GamescopeSettings | null;
}

export interface WinePrefixInfo {
  path: string | null;
  exists: boolean;
  sizeInBytes: number | null;
}
