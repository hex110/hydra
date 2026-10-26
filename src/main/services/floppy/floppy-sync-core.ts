import type { PlayStatus } from "@types";

export const FLOPPY_STATUS = {
  planning: 0,
  inProgress: 1,
  paused: 2,
  completed: 3,
  dropped: 4,
} as const;

export interface FloppySearchResult {
  media_id: string | number;
  title: string;
  year?: number | null;
  platforms?: string[];
}

export interface FloppyTrackedState {
  tracked: boolean;
  status: number | null;
  progress: number;
}

export interface FloppyGameInput {
  title: string;
  playTimeInMilliseconds: number;
  playStatus?: PlayStatus | null;
  wishlisted?: boolean;
}

export type FloppySyncReason = "playtime" | "status" | "wishlist" | "backfill";

export interface FloppyPatch {
  status?: number;
  progress?: number;
}

const PC_PLATFORM = "PC (Microsoft Windows)";

const PLAY_STATUS_TO_FLOPPY: Record<PlayStatus, number> = {
  playing: FLOPPY_STATUS.inProgress,
  finished: FLOPPY_STATUS.completed,
  dropped: FLOPPY_STATUS.dropped,
  backlog: FLOPPY_STATUS.planning,
};

export const normalizeTitle = (title: string) =>
  title
    .replaceAll(/[™®©]/g, "")
    .normalize("NFKD")
    .replaceAll(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replaceAll("&", " and ")
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim();

/** Exact normalised title only: a wrong match would write to the wrong entry. */
export const pickMatch = (
  title: string,
  results: FloppySearchResult[]
): FloppySearchResult | null => {
  const wanted = normalizeTitle(title);
  const exact = results.filter((r) => normalizeTitle(r.title) === wanted);

  return (
    exact.find((r) => r.platforms?.includes(PC_PLATFORM)) ?? exact[0] ?? null
  );
};

export const playTimeToMinutes = (milliseconds: number) =>
  Math.floor(milliseconds / 60_000);

/**
 * Only an explicit status change in Hydra may overwrite a status already in
 * Floppy; other syncs may only promote an untouched Planning entry. Playtime
 * only ever rises, so playtime entered in Floppy is never lowered.
 */
export const planPatch = (
  game: FloppyGameInput,
  state: FloppyTrackedState,
  reason: FloppySyncReason
): FloppyPatch => {
  const patch: FloppyPatch = {};
  const minutes = playTimeToMinutes(game.playTimeInMilliseconds);
  const current = state.tracked ? state.status : null;

  if (reason !== "wishlist" && minutes > state.progress) {
    patch.progress = minutes;
  }

  const hydraStatus = game.playStatus
    ? PLAY_STATUS_TO_FLOPPY[game.playStatus]
    : null;

  const inferred =
    hydraStatus ??
    (minutes > 0 ? FLOPPY_STATUS.inProgress : FLOPPY_STATUS.planning);

  if (reason === "status" && hydraStatus !== null) {
    if (hydraStatus !== current) patch.status = hydraStatus;
  } else if (!state.tracked) {
    if (hydraStatus !== null || game.wishlisted || minutes > 0) {
      patch.status = inferred;
    }
  } else if (current === FLOPPY_STATUS.planning && inferred !== current) {
    patch.status = inferred;
  }

  return patch;
};
