import type {
  GameLibraryMetadata,
  HowLongToBeatCategory,
  HowLongToBeatHours,
  PlayStatus,
} from "@types";

export const PLAY_STATUSES: readonly PlayStatus[] = [
  "playing",
  "backlog",
  "finished",
  "dropped",
];

/** Refetch catalogue metadata a week after it was fetched. */
export const LIBRARY_METADATA_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Bumped when cached metadata changes meaning, so older entries refetch. */
export const LIBRARY_METADATA_VERSION = 2;

/** Steam tags kept per game, most voted first. */
export const STEAM_TAG_LIMIT = 8;

const FRACTIONS: Record<string, number> = {
  "½": 0.5,
  "¼": 0.25,
  "¾": 0.75,
};

/** Reads How Long to Beat durations such as "26 Hours", "12½ Hours" or "45 Mins". */
export const parseHowLongToBeatDuration = (duration: string): number | null => {
  const match =
    /^\s*(\d+(?:\.\d+)?)?\s*([½¼¾])?\s*(hours?|mins?|minutes?)/i.exec(duration);
  if (!match || (!match[1] && !match[2])) return null;

  const value = Number(match[1] ?? 0) + (match[2] ? FRACTIONS[match[2]] : 0);
  const hours = /^min/i.test(match[3]) ? value / 60 : value;
  return hours > 0 ? Math.round(hours * 100) / 100 : null;
};

export const parseHowLongToBeat = (
  categories: HowLongToBeatCategory[] | null | undefined
): HowLongToBeatHours | null => {
  if (!Array.isArray(categories) || categories.length === 0) return null;

  const find = (pattern: RegExp) => {
    const category = categories.find((item) => pattern.test(item.title));
    return category ? parseHowLongToBeatDuration(category.duration) : null;
  };

  const hours: HowLongToBeatHours = {
    mainStory: find(/^main story$/i) ?? find(/single-player|solo/i),
    mainExtra: find(/main \+ (sides|extras)/i),
    completionist: find(/completionist/i),
  };

  return Object.values(hours).some((value) => value !== null) ? hours : null;
};

/** Steam's "Dec 9, 2020" style dates, or ISO dates from the Hydra catalogue. */
export const parseReleaseDate = (
  value: string | null | undefined
): string | null => {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
};

/** Genres from Steam (`description`) or the Hydra/LaunchBox mapping (`name`). */
export const getGenreNames = (
  genres: ({ name?: string; description?: string } | string)[] | undefined
): string[] => {
  if (!Array.isArray(genres)) return [];
  const names = genres.flatMap((genre) => {
    const name =
      typeof genre === "string" ? genre : (genre.description ?? genre.name);
    return name?.trim() ? [name.trim()] : [];
  });
  return Array.from(new Set(names));
};

/** Steam tag name → id, as `/catalogue/steam/tags` returns it, flipped to id → name. */
export const invertSteamTags = (
  tags: Record<string, number> | null | undefined
): Map<string, string> =>
  new Map(Object.entries(tags ?? {}).map(([name, id]) => [String(id), name]));

/** A game's most voted Steam tags by name; ids the map doesn't know are dropped. */
export const getSteamTagNames = (
  tagIds: (string | number)[] | null | undefined,
  namesById: ReadonlyMap<string, string>,
  limit = STEAM_TAG_LIMIT
): string[] => {
  if (!Array.isArray(tagIds)) return [];
  const names = tagIds.flatMap((id) => {
    const name = namesById.get(String(id));
    return name ? [name] : [];
  });
  return Array.from(new Set(names)).slice(0, limit);
};

export const getEffectiveGenres = (game: {
  customGenres?: string[] | null;
  metadata?: Pick<GameLibraryMetadata, "genres"> | null;
}): string[] =>
  game.customGenres && game.customGenres.length > 0
    ? game.customGenres
    : (game.metadata?.genres ?? []);

export const isLibraryMetadataStale = (
  metadata:
    | Pick<GameLibraryMetadata, "fetchedAt" | "version">
    | null
    | undefined,
  now = Date.now()
) =>
  !metadata ||
  metadata.version !== LIBRARY_METADATA_VERSION ||
  now - metadata.fetchedAt > LIBRARY_METADATA_MAX_AGE_MS;
