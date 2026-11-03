type PlayStatus = "playing" | "finished" | "dropped" | "backlog";

export interface HomeGame {
  shop: string;
  objectId: string;
  title?: string | null;
  playStatus?: PlayStatus | null;
  lastTimePlayed?: Date | string | null;
  playTimeInMilliseconds?: number;
  steamPlayTimeInMilliseconds?: number;
  epicPlayTimeInMilliseconds?: number;
  syncedPlayTimeInMilliseconds?: number;
  catalogueGame?: { shop: string; objectId: string };
  members?: HomeGame[];
  metadata?: { howLongToBeat: { mainStory: number | null } | null } | null;
  newDownloadOptionsCount?: number;
  wishlisted?: boolean;
  addedToLibraryAt?: Date | string | null;
  achievementCount?: number;
  unlockedAchievementCount?: number;
}

export const CONTINUE_PLAYING_LIMIT = 8;
export const BACKLOG_LIMIT = 12;
export const NEW_DOWNLOADS_LIMIT = 12;
export const WISHLIST_LIMIT = 12;
export const RECENTLY_ADDED_LIMIT = 12;
export const ALMOST_DONE_LIMIT = 12;
/** How long a game counts as recently added. */
export const RECENTLY_ADDED_MS = 30 * 24 * 60 * 60 * 1000;
/** Share of achievements or of the main story time that counts as almost done. */
export const ALMOST_DONE_RATIO = 0.8;
/** A game not started for this long counts as backlog again. */
export const BACKLOG_IDLE_MS = 60 * 24 * 60 * 60 * 1000;

const FINISHED_STATUSES: (PlayStatus | null | undefined)[] = [
  "finished",
  "dropped",
];

const toTime = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

const totalPlayTime = (game: HomeGame) =>
  (game.playTimeInMilliseconds ?? 0) +
  (game.steamPlayTimeInMilliseconds ?? 0) +
  (game.epicPlayTimeInMilliseconds ?? 0) +
  (game.syncedPlayTimeInMilliseconds ?? 0);

export const gameKey = (game: { shop: string; objectId: string }) =>
  `${game.shop}:${game.objectId}`;

/** Recently played games that aren't finished or dropped, newest first. */
export const getContinuePlaying = <T extends HomeGame>(
  games: T[],
  limit = CONTINUE_PLAYING_LIMIT
): T[] =>
  games
    .filter(
      (game) =>
        toTime(game.lastTimePlayed) !== null &&
        !FINISHED_STATUSES.includes(game.playStatus)
    )
    .sort(
      (a, b) =>
        (toTime(b.lastTimePlayed) ?? 0) - (toTime(a.lastTimePlayed) ?? 0)
    )
    .slice(0, limit);

/**
 * Installed games waiting to be played: marked Backlog, never played, or not
 * played for two months. Marked games come first, then never played, then
 * the longest untouched; shorter games first within each.
 */
export const getBacklog = <T extends HomeGame>(
  games: T[],
  isInstalled: (game: T) => boolean,
  excludeKeys: Set<string>,
  now = Date.now(),
  limit = BACKLOG_LIMIT
): T[] => {
  const rank = (game: T) => {
    if (game.playStatus === "backlog") return 0;
    return toTime(game.lastTimePlayed) === null && totalPlayTime(game) === 0
      ? 1
      : 2;
  };

  return games
    .filter((game) => {
      if (excludeKeys.has(gameKey(game))) return false;
      if (!isInstalled(game)) return false;
      if (game.playStatus && game.playStatus !== "backlog") return false;
      if (game.playStatus === "backlog") return true;
      const lastPlayed = toTime(game.lastTimePlayed);
      return lastPlayed === null || now - lastPlayed > BACKLOG_IDLE_MS;
    })
    .sort((a, b) => {
      const byRank = rank(a) - rank(b);
      if (byRank !== 0) return byRank;
      if (rank(a) === 2) {
        const byAge =
          (toTime(a.lastTimePlayed) ?? 0) - (toTime(b.lastTimePlayed) ?? 0);
        if (byAge !== 0) return byAge;
      }
      const aLength = a.metadata?.howLongToBeat?.mainStory ?? Infinity;
      const bLength = b.metadata?.howLongToBeat?.mainStory ?? Infinity;
      if (aLength !== bLength) return aLength - bLength;
      return (a.title ?? "").localeCompare(b.title ?? "");
    })
    .slice(0, limit);
};

/** Keys a library game is known by: each copy and its catalogue game. */
export const getOwnedKeys = (games: HomeGame[]): Set<string> =>
  new Set(
    games.flatMap((game) =>
      (game.members?.length ? game.members : [game]).flatMap((copy) => [
        gameKey(copy),
        ...(copy.catalogueGame ? [gameKey(copy.catalogueGame)] : []),
      ])
    )
  );

const copiesOf = <T extends HomeGame>(game: T): HomeGame[] =>
  game.members?.length ? game.members : [game];

const isWishlisted = (game: HomeGame) =>
  copiesOf(game).some((copy) => copy.wishlisted);

/** New download options found for any copy of the game. */
export const getNewDownloadOptionsCount = (game: HomeGame): number =>
  copiesOf(game).reduce(
    (sum, copy) => sum + Math.max(0, copy.newDownloadOptionsCount ?? 0),
    0
  );

/**
 * Games you haven't installed that a download source has new options for,
 * wishlisted games first. Installed games show under updates instead.
 */
export const getNewDownloads = <T extends HomeGame>(
  games: T[],
  isInstalled: (game: T) => boolean,
  limit = NEW_DOWNLOADS_LIMIT
): T[] =>
  games
    .filter(
      (game) => !isInstalled(game) && getNewDownloadOptionsCount(game) > 0
    )
    .sort((a, b) => {
      const byWishlist = Number(isWishlisted(b)) - Number(isWishlisted(a));
      if (byWishlist !== 0) return byWishlist;
      const byCount =
        getNewDownloadOptionsCount(b) - getNewDownloadOptionsCount(a);
      if (byCount !== 0) return byCount;
      return (a.title ?? "").localeCompare(b.title ?? "");
    })
    .slice(0, limit);

/** Games added in the last 30 days and not played yet, newest first. */
export const getRecentlyAdded = <T extends HomeGame>(
  games: T[],
  excludeKeys: Set<string>,
  now = Date.now(),
  limit = RECENTLY_ADDED_LIMIT
): T[] =>
  games
    .filter((game) => {
      if (excludeKeys.has(gameKey(game))) return false;
      const addedAt = toTime(game.addedToLibraryAt);
      if (addedAt === null || now - addedAt > RECENTLY_ADDED_MS) return false;
      return toTime(game.lastTimePlayed) === null && totalPlayTime(game) === 0;
    })
    .sort(
      (a, b) =>
        (toTime(b.addedToLibraryAt) ?? 0) - (toTime(a.addedToLibraryAt) ?? 0)
    )
    .slice(0, limit);

/**
 * How close a game is to done, 0–1: the larger of the achievement share and
 * the playtime against How Long to Beat's main story. Null when neither is
 * known or the game is already complete.
 */
export const getCompletionProgress = (game: HomeGame): number | null => {
  const total = game.achievementCount ?? 0;
  const unlocked = game.unlockedAchievementCount ?? 0;
  if (total > 0 && unlocked >= total) return null;

  const achievements = total > 0 ? unlocked / total : null;
  const mainStory = game.metadata?.howLongToBeat?.mainStory ?? null;
  const story =
    mainStory && mainStory > 0
      ? Math.min(0.99, totalPlayTime(game) / (mainStory * 3_600_000))
      : null;

  if (achievements === null && story === null) return null;
  return Math.max(achievements ?? 0, story ?? 0);
};

/** Played games past 80 % of their achievements or main story, closest first. */
export const getAlmostDone = <T extends HomeGame>(
  games: T[],
  excludeKeys: Set<string>,
  limit = ALMOST_DONE_LIMIT
): T[] =>
  games
    .filter(
      (game) =>
        !excludeKeys.has(gameKey(game)) &&
        !FINISHED_STATUSES.includes(game.playStatus) &&
        totalPlayTime(game) > 0 &&
        (getCompletionProgress(game) ?? 0) >= ALMOST_DONE_RATIO
    )
    .sort(
      (a, b) =>
        (getCompletionProgress(b) ?? 0) - (getCompletionProgress(a) ?? 0)
    )
    .slice(0, limit);

/**
 * Wishlisted games you haven't installed, the ones with new download options
 * first, then the most recently added.
 */
export const getWishlist = <T extends HomeGame>(
  games: T[],
  isInstalled: (game: T) => boolean,
  limit = WISHLIST_LIMIT
): T[] =>
  games
    .filter((game) => isWishlisted(game) && !isInstalled(game))
    .sort((a, b) => {
      const byNew =
        getNewDownloadOptionsCount(b) - getNewDownloadOptionsCount(a);
      if (byNew !== 0) return byNew;
      return (
        (toTime(b.addedToLibraryAt) ?? 0) - (toTime(a.addedToLibraryAt) ?? 0)
      );
    })
    .slice(0, limit);
