/**
 * waiting: Hydra opened Steam's install dialog and Steam has not started yet.
 * finishing: Steam is moving the staged files into place.
 */
export type SteamDownloadStatus =
  | "waiting"
  | "queued"
  | "downloading"
  | "paused"
  | "finishing";

/** An install Steam is doing for a library game. Hydra only watches it. */
export interface SteamDownload {
  appId: string;
  title: string;
  status: SteamDownloadStatus;
  /** 0 to 1; null before Steam has worked out the size. */
  progress: number | null;
  bytesDone: number | null;
  bytesTotal: number | null;
  /** Estimated network speed; null when not moving. */
  bytesPerSecond: number | null;
}

/** One way Steam can start an installed game ("Play", "Play in VR"). */
export interface SteamLaunchOptionInfo {
  /** The entry's key in Steam's launch list. */
  id: string;
  /** Steam's own name for it, when it has one. */
  description: string | null;
  /** File name of the program, for entries without a description. */
  executable: string;
  type: string | null;
  /** The entry Steam's Play button runs. */
  isDefault: boolean;
}

/** What the header's Steam button shows. */
export interface SteamState {
  installed: boolean;
  running: boolean;
}

/** How a request to update a Steam game through Steam ended. */
export type SteamUpdateResult =
  | "started"
  | "steam-not-installed"
  | "steam-not-running"
  | "steam-start-failed";

/** A branch ("beta") a Steam game can follow. */
export interface SteamBranchInfo {
  name: string;
  description: string | null;
  buildId: string | null;
  /** Seconds since the epoch of the branch's last update. */
  updatedAt: number | null;
  /** Needs a password Hydra cannot enter; it is listed but cannot be picked. */
  locked: boolean;
}

export interface SteamBranchesInfo {
  /** The branch the game follows now ("public" by default). */
  current: string;
  branches: SteamBranchInfo[];
}

export type SteamBranchSwitchResult =
  | "switched"
  | "not-installed"
  | "unknown-branch"
  | "branch-locked"
  | "steam-would-not-close"
  | "manifest-unreadable"
  | "manifest-unwritable"
  | "steam-start-failed";
