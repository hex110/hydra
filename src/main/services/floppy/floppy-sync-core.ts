import type { FloppySearchResult, PlayStatus } from "@types";

export const FLOPPY_STATUS = {
  planning: 0,
  inProgress: 1,
  paused: 2,
  completed: 3,
  dropped: 4,
} as const;

export interface FloppyTrackedState {
  tracked: boolean;
  status: number | null;
  progress: number;
  score: number | null;
  startDate: string | null;
  endDate: string | null;
}

/** One tracked game as listed by Floppy. */
export interface FloppyEntry {
  mediaId: string;
  title: string;
  status: number | null;
  score: number | null;
  progress: number;
  /** How the entry got into Floppy: "steam" for its Steam import. */
  entrySource: string | null;
}

export interface FloppyGameInput {
  title: string;
  playTimeInMilliseconds: number;
  playStatus?: PlayStatus | null;
  wishlisted?: boolean;
  rating?: number | null;
  /** First sign of play, e.g. the first achievement unlocked on Steam. */
  startedAt?: Date | null;
  lastPlayedAt?: Date | null;
}

export type FloppySyncReason = "playtime" | "status" | "rating" | "backfill";

export interface FloppyPatch {
  status?: number;
  progress?: number;
  score?: number | null;
  start_date?: string;
  end_date?: string;
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

const toDay = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

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

  if (minutes > state.progress) patch.progress = minutes;

  // Only an explicit rating change may clear Floppy's score.
  const rating = game.rating ?? null;
  if (rating !== state.score && (rating !== null || reason === "rating")) {
    if (reason !== "playtime") patch.score = rating;
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
    if (hydraStatus !== null || minutes > 0 || patch.score != null) {
      patch.status = inferred;
    }
  } else if (current === FLOPPY_STATUS.planning && inferred !== current) {
    patch.status = inferred;
  }

  // Dates are only filled in, never changed: they are approximations.
  if (game.startedAt && !state.startDate) {
    patch.start_date = toDay(game.startedAt);
  }
  const finalStatus = patch.status ?? current;
  if (
    game.lastPlayedAt &&
    finalStatus === FLOPPY_STATUS.completed &&
    !state.endDate
  ) {
    patch.end_date = toDay(game.lastPlayedAt);
  }

  return patch;
};

/** Paused has no Hydra equivalent, so it leaves the play status alone. */
export const floppyStatusToPlayStatus = (
  status: number | null
): PlayStatus | undefined => {
  switch (status) {
    case FLOPPY_STATUS.planning:
      return "backlog";
    case FLOPPY_STATUS.inProgress:
      return "playing";
    case FLOPPY_STATUS.completed:
      return "finished";
    case FLOPPY_STATUS.dropped:
      return "dropped";
    default:
      return undefined;
  }
};

export interface FloppyPullChange {
  playStatus?: PlayStatus;
  rating?: number | null;
  wishlisted?: boolean;
}

/**
 * Floppy wins on status and rating. Wishlist is only ever added to: a game
 * Hydra wishlisted before the sync existed is not on Floppy's list, and must
 * not be dropped for that.
 */
export const planPull = (
  game: Pick<FloppyGameInput, "playStatus" | "rating" | "wishlisted">,
  entry: Pick<FloppyEntry, "status" | "score">,
  onWishlist: boolean
): FloppyPullChange => {
  const change: FloppyPullChange = {};
  const playStatus = floppyStatusToPlayStatus(entry.status);

  if (playStatus !== undefined && playStatus !== (game.playStatus ?? null)) {
    change.playStatus = playStatus;
  }

  if (entry.score !== (game.rating ?? null)) change.rating = entry.score;
  if (onWishlist && !game.wishlisted) change.wishlisted = true;

  return change;
};

export interface CatalogueSuggestion {
  title: string;
  objectId: string;
  shop: string;
  iconUrl: string | null;
}

/** One exact title only: two catalogue games of that name are a guess. */
export const pickCatalogueMatch = (
  title: string,
  suggestions: CatalogueSuggestion[]
): CatalogueSuggestion | null => {
  const wanted = normalizeTitle(title);
  const exact = suggestions.filter(
    (item) => item.shop === "steam" && normalizeTitle(item.title) === wanted
  );

  return exact.length === 1 ? exact[0] : null;
};

/**
 * Entries Floppy imported from Steam, and games Steam already lists, belong
 * to the Steam import and its playtime limit, not to this one.
 */
export const isFloppyOnlyEntry = (
  entry: Pick<FloppyEntry, "title" | "entrySource">,
  ownedSteamTitles: ReadonlySet<string>
) =>
  entry.entrySource !== "steam" &&
  !ownedSteamTitles.has(normalizeTitle(entry.title));
