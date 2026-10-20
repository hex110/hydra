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
  catalogueGame?: { shop: string; objectId: string };
  members?: HomeGame[];
  metadata?: { howLongToBeat: { mainStory: number | null } | null } | null;
}

export interface SuggestedGame {
  shop: string;
  objectId: string;
  title: string;
}

export const CONTINUE_PLAYING_LIMIT = 8;
export const BACKLOG_LIMIT = 12;
export const SUGGESTIONS_LIMIT = 12;
export const SUGGESTION_SEEDS = 5;
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
  (game.epicPlayTimeInMilliseconds ?? 0);

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

/**
 * The games suggestions start from: most played in recent activity, then by
 * total playtime, with finished games counted up. Dropped games are left out.
 */
export const getSuggestionSeeds = <T extends HomeGame>(
  games: T[],
  recentPlayByKey: Map<string, number>,
  limit = SUGGESTION_SEEDS
): T[] => {
  const weight = (game: T) => {
    const copies = game.members?.length ? game.members : [game];
    const recent = copies.reduce(
      (sum, copy) => sum + (recentPlayByKey.get(gameKey(copy)) ?? 0),
      0
    );
    const finishedBonus = game.playStatus === "finished" ? 10 * 3_600_000 : 0;
    return recent * 3 + totalPlayTime(game) + finishedBonus;
  };

  return games
    .filter((game) => game.playStatus !== "dropped" && weight(game) > 0)
    .filter((game) => (game.catalogueGame ?? game).shop === "steam")
    .sort((a, b) => weight(b) - weight(a))
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

export interface SeedSimilarGames<S extends SuggestedGame> {
  seedTitle: string;
  games: S[];
}

export interface RankedSuggestion<S extends SuggestedGame> {
  game: S;
  /** The played game that contributed most to the suggestion. */
  becauseOf: string;
}

/**
 * Games similar to several seeds, or high in a stronger seed's list, rank
 * first. No seed explains more than its share of the list, so one heavily
 * played game doesn't fill it. Owned games are left out.
 */
export const rankSuggestions = <S extends SuggestedGame>(
  seeds: SeedSimilarGames<S>[],
  ownedKeys: Set<string>,
  limit = SUGGESTIONS_LIMIT
): RankedSuggestion<S>[] => {
  const scores = new Map<
    string,
    { game: S; score: number; best: number; becauseOf: string }
  >();

  seeds.forEach((seed, seedIndex) => {
    const seedWeight = 1 / (seedIndex + 1);
    const candidates = seed.games.filter(
      (game) => !ownedKeys.has(gameKey(game))
    );
    candidates.forEach((game, index) => {
      const key = gameKey(game);
      const contribution = seedWeight * (1 - index / (candidates.length + 1));
      const current = scores.get(key);
      if (!current) {
        scores.set(key, {
          game,
          score: contribution,
          best: contribution,
          becauseOf: seed.seedTitle,
        });
        return;
      }
      current.score += contribution;
      if (contribution > current.best) {
        current.best = contribution;
        current.becauseOf = seed.seedTitle;
      }
    });
  });

  const ranked = [...scores.values()].sort((a, b) => b.score - a.score);
  const seedsWithResults = new Set(ranked.map((item) => item.becauseOf)).size;
  const perSeed = Math.ceil(limit / Math.max(1, seedsWithResults));
  const counts = new Map<string, number>();
  const picked: typeof ranked = [];
  const overflow: typeof ranked = [];

  for (const item of ranked) {
    const count = counts.get(item.becauseOf) ?? 0;
    if (count < perSeed) {
      counts.set(item.becauseOf, count + 1);
      picked.push(item);
    } else {
      overflow.push(item);
    }
  }

  return [...picked, ...overflow]
    .slice(0, limit)
    .sort((a, b) => b.score - a.score)
    .map(({ game, becauseOf }) => ({ game, becauseOf }));
};
