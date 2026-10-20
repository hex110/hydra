export type LibraryGameActivityKind =
  | "downloading"
  | "paused"
  | "queued"
  | "extracting"
  | "setup";

export interface LibraryGameActivity {
  kind: LibraryGameActivityKind;
  /** 0–1, when known. */
  progress: number | null;
}

interface ActivityDownload {
  status: string | null;
  queued?: boolean;
  progress: number;
  extracting?: boolean;
}

export interface ActivityGame {
  id: string;
  download?: ActivityDownload | null;
  members?: ActivityGame[];
}

export interface ActivityState {
  /** Game id of the download that is running now, and its progress. */
  activeDownload: { gameId: string; progress: number } | null;
  /** Game id being extracted, and its progress. */
  extraction: { gameId: string; progress: number } | null;
  /** Game ids with setup queued or running. */
  setupGameIds: ReadonlySet<string>;
}

/** What a library card shows while a copy of the game is downloading, extracting or being set up. */
export const getLibraryGameActivity = (
  game: ActivityGame,
  state: ActivityState
): LibraryGameActivity | null => {
  const copies = game.members?.length ? game.members : [game];

  for (const copy of copies) {
    if (state.extraction?.gameId === copy.id) {
      return { kind: "extracting", progress: state.extraction.progress };
    }
    if (state.activeDownload?.gameId === copy.id) {
      return { kind: "downloading", progress: state.activeDownload.progress };
    }
  }

  for (const copy of copies) {
    if (state.setupGameIds.has(copy.id))
      return { kind: "setup", progress: null };
  }

  for (const copy of copies) {
    const download = copy.download;
    if (!download) continue;
    if (download.extracting) return { kind: "extracting", progress: null };
    if (download.status === "active" || download.status === "waiting") {
      return { kind: "downloading", progress: download.progress };
    }
    if (download.status === "paused") {
      return {
        kind: download.queued ? "queued" : "paused",
        progress: download.progress,
      };
    }
  }

  return null;
};
