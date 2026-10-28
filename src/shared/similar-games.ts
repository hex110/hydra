export interface SteamTagWeight {
  tagid: number;
  weight: number;
}

export interface SteamSimilarGame {
  objectId: string;
  shop: "steam";
  title: string;
  iconUrl: string | null;
  libraryHeroImageUrl: string | null;
  libraryImageUrl: string | null;
  coverImageUrl: string | null;
  logoImageUrl: string | null;
  downloadSources: string[];
}

export interface SimilarCandidate {
  tags: SteamTagWeight[];
  reviewCount?: number;
}

// Steam's own "More like this" page also lists demos and unreleased games.
const MORE_LIKE_THIS_SECTIONS = new Set([
  "released",
  "topselling",
  "newreleases",
  "freegames3",
]);

// Steam's order reflects what its players own and play, so it counts for more
// than tags alone, which on their own favour obscure games with matching tags.
const STEAM_ORDER_WEIGHT = 0.5;
const POPULARITY_WEIGHT = 0.1;
/** Review count at which a game counts as fully popular. */
const POPULAR_REVIEW_COUNT = 100_000;

const SECONDARY_RELEASE_TITLE =
  /\b(prologue|demo|playtest|soundtrack|alpha|beta)\b/i;

/** Free prologues, demos and test builds are separate store apps, not games to suggest. */
export const isSecondaryRelease = (title: string) =>
  SECONDARY_RELEASE_TITLE.test(title);

/** App ids from the main grids of Steam's "More like this" page, in page order. */
export const parseSteamMoreLikeThis = (html: string): string[] => {
  const grids = Array.from(
    html.matchAll(/similar_grid_ctn"\s+id="(\w+)"/g),
    (match) => ({ id: match[1], start: match.index ?? 0 })
  );
  const ids = new Set<string>();

  grids.forEach((grid, index) => {
    if (!MORE_LIKE_THIS_SECTIONS.has(grid.id)) return;

    const end = grids[index + 1]?.start ?? html.length;
    const section = html.slice(grid.start, end);

    for (const match of section.matchAll(
      /class="similar_grid_capsule"[^>]*?data-ds-appid="(\d+)"/g
    )) {
      ids.add(match[1]);
    }
  });

  return Array.from(ids);
};

const toVector = (tags: SteamTagWeight[], idf: ReadonlyMap<number, number>) => {
  const top = Math.max(1, ...tags.map(({ weight }) => weight));
  const vector = new Map<number, number>();

  for (const { tagid, weight } of tags) {
    // Tags nobody in the pool shares carry no signal either way.
    const rarity = idf.get(tagid) ?? 0;
    vector.set(tagid, Math.sqrt(weight / top) * rarity);
  }

  return vector;
};

const norm = (vector: ReadonlyMap<number, number>) =>
  Math.sqrt(Array.from(vector.values()).reduce((sum, v) => sum + v * v, 0));

/**
 * Orders Steam's candidates (given in Steam's own order) by how closely their
 * tags match the game's: cosine similarity of vote-weighted tags, where a tag
 * most candidates share counts for less than a rare one. Steam's own order
 * and the game's popularity are added on top.
 */
export const rankSimilarGames = <T extends SimilarCandidate>(
  source: SteamTagWeight[],
  candidates: T[]
): T[] => {
  if (candidates.length === 0) return [];

  const documentFrequency = new Map<number, number>();
  for (const { tags } of candidates) {
    for (const { tagid } of tags) {
      documentFrequency.set(tagid, (documentFrequency.get(tagid) ?? 0) + 1);
    }
  }

  const idf = new Map<number, number>();
  for (const [tagid, count] of documentFrequency) {
    idf.set(tagid, Math.log(1 + candidates.length / count));
  }

  const sourceVector = toVector(source, idf);
  const sourceNorm = norm(sourceVector);

  const scored = candidates.map((candidate, index) => {
    const vector = toVector(candidate.tags, idf);
    const candidateNorm = norm(vector);
    let dot = 0;

    for (const [tagid, value] of vector) {
      dot += value * (sourceVector.get(tagid) ?? 0);
    }

    const similarity =
      sourceNorm > 0 && candidateNorm > 0
        ? dot / (sourceNorm * candidateNorm)
        : 0;
    const steamOrder = 1 - index / candidates.length;
    const popularity = Math.min(
      1,
      Math.log10(1 + (candidate.reviewCount ?? 0)) /
        Math.log10(POPULAR_REVIEW_COUNT)
    );

    return {
      candidate,
      score:
        similarity +
        STEAM_ORDER_WEIGHT * steamOrder +
        POPULARITY_WEIGHT * popularity,
    };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .map(({ candidate }) => candidate);
};
