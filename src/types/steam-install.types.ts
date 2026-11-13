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
