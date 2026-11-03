import { isSecondaryRelease } from "../similar-games.js";
import {
  expandTagFamilies,
  IDLE_TAG_IDS,
  isSingleplayerGame,
  STEAM_GAME_TYPE,
} from "../store-games.js";
import { getRatingQuality } from "../store-rating.js";
import { getAvoidedTags, hasTagAmong, type WeightedSeed } from "./profile.js";
import {
  buildIdf,
  dot,
  tagVector,
  toUnitVector,
  type TagVector,
} from "./vector.js";
import type { PoolCandidate, Recommendation, TuneOptions } from "./types.js";

const IDLE_TAGS: ReadonlySet<number> = new Set(IDLE_TAG_IDS);
/** A game counts as idle when an idle tag is among its first five. */
const IDLE_DEPTH = 5;
const SIMILARITY_WEIGHT = 0.6;
const BEHAVIOUR_WEIGHT = 0.25;
const QUALITY_WEIGHT = 0.15;
const SLIDER_STRENGTH = 0.25;
/** Below this many reviews Steam's percentage says little, so it is not a filter. */
const PERCENT_FILTER_FROM = 50;
const FIRST_YEAR = 2000;
const MATCH_TAGS = 2;
const BECAUSE_SEEDS = 20;
const BEHAVIOUR_REASON_SHARE = 0.5;
const DIVERSITY_WEIGHT = 0.2;
const PER_SEED_BLOCK = 12;
const PER_SEED = 3;
const PER_DEVELOPER = 2;

export interface ScoredCandidate {
  candidate: PoolCandidate;
  score: number;
  similarity: number;
  /** The candidate's tags as a unit vector, to measure how alike two results are. */
  vector: TagVector;
  becauseOf: { key: string; appId: string; title: string } | null;
  matchTagIds: number[];
}

const releaseYear = (candidate: PoolCandidate) =>
  candidate.releaseDate
    ? new Date(candidate.releaseDate).getUTCFullYear()
    : null;

/** Which hard filters a candidate passes; none of them needs a request. */
export const passesFilters = (
  candidate: PoolCandidate,
  options: TuneOptions
): boolean => {
  if (candidate.type !== STEAM_GAME_TYPE) return false;
  if (isSecondaryRelease(candidate.title)) return false;

  const reviews = candidate.reviewCount ?? 0;
  if (reviews < options.minReviews) return false;
  if (options.maxReviews !== null && reviews > options.maxReviews) return false;
  if (
    reviews >= PERCENT_FILTER_FROM &&
    (candidate.reviewPercent ?? 0) < options.minReviewPercent
  )
    return false;

  if (
    options.avoidTags.length > 0 &&
    hasTagAmong(
      candidate.tags,
      getAvoidedTags(options),
      options.avoidStrictness
    )
  )
    return false;

  // Idle games are background play: while the rule is on they are not
  // suggested, unless the person asked for them by leaning toward one.
  if (
    options.idleDiscount &&
    !options.leanTags.some((id) => IDLE_TAGS.has(id)) &&
    hasTagAmong(candidate.tags, IDLE_TAGS, IDLE_DEPTH)
  )
    return false;

  for (const lean of options.leanTags) {
    const accepted = new Set(expandTagFamilies([lean]));
    if (!hasTagAmong(candidate.tags, accepted, options.leanDepth)) return false;
  }

  if (options.years) {
    const year = releaseYear(candidate);
    if (year === null) return false;
    if (options.years.gte !== undefined && year < options.years.gte)
      return false;
    if (options.years.lte !== undefined && year > options.years.lte)
      return false;
  }

  if (options.singleplayerOnly && !isSingleplayerGame(candidate)) return false;
  if (options.hideEarlyAccess && candidate.isEarlyAccess) return false;
  return true;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Orders candidates by how well they fit the taste vector: tag similarity,
 * Steam's own "More like this" lists and review quality, then nudged by the
 * Popular and Newer sliders. The sliders change the order, not what counts as
 * similar. Candidates that fail a hard filter are left out.
 */
export const rankCandidates = (
  pool: readonly PoolCandidate[],
  taste: TagVector,
  seeds: readonly WeightedSeed[],
  options: TuneOptions,
  now = Date.now()
): ScoredCandidate[] => {
  if (pool.length === 0) return [];

  const idf = buildIdf(pool.map((candidate) => candidate.tags));
  const tasteUnit = toUnitVector(taste, idf);
  const currentYear = new Date(now).getUTCFullYear();

  const reasonSeeds = seeds
    .filter((seed) => seed.weight > 0 && !(options.idleDiscount && seed.isIdle))
    .slice(0, BECAUSE_SEEDS)
    .map((seed) => ({
      seed,
      vector: toUnitVector(tagVector(seed.tags), idf),
    }));
  const topWeight = Math.max(
    1e-9,
    ...reasonSeeds.map(({ seed }) => seed.weight)
  );
  const weightByKey = new Map(
    reasonSeeds.map(({ seed }) => [seed.key, seed.weight / topWeight])
  );

  const scored: ScoredCandidate[] = [];
  for (const candidate of pool) {
    if (!passesFilters(candidate, options)) continue;

    const vector = toUnitVector(tagVector(candidate.tags), idf);
    const similarity = dot(tasteUnit, vector);

    const behaviour = candidate.behaviour.reduce(
      (best, { seedKey, place }) =>
        Math.max(best, (weightByKey.get(seedKey) ?? 0) * place),
      0
    );
    const quality = getRatingQuality({
      reviewPercent: candidate.reviewPercent,
      reviewCount: candidate.reviewCount,
      criticScore: candidate.criticScore,
    });

    let score =
      SIMILARITY_WEIGHT * similarity +
      BEHAVIOUR_WEIGHT * behaviour +
      QUALITY_WEIGHT * quality;

    const popularity = Math.min(
      1,
      Math.log10(1 + (candidate.reviewCount ?? 0)) / 5
    );
    score += SLIDER_STRENGTH * options.popularity * (popularity - 0.5);

    const year = releaseYear(candidate);
    if (year !== null) {
      const age = clamp((year - FIRST_YEAR) / (currentYear - FIRST_YEAR), 0, 1);
      score += SLIDER_STRENGTH * options.recency * (age - 0.5);
    }

    let becauseOf: ScoredCandidate["becauseOf"] = null;
    let bestContribution = 0;
    for (const { seed, vector: seedVector } of reasonSeeds) {
      const place =
        candidate.behaviour.find((entry) => entry.seedKey === seed.key)
          ?.place ?? 0;
      const contribution =
        (weightByKey.get(seed.key) ?? 0) *
        (dot(seedVector, vector) + BEHAVIOUR_REASON_SHARE * place);
      if (contribution > bestContribution) {
        bestContribution = contribution;
        becauseOf = { key: seed.key, appId: seed.appId, title: seed.title };
      }
    }

    const matchTagIds = [...vector]
      .map(([tagid, value]) => ({
        tagid,
        value: value * (tasteUnit.get(tagid) ?? 0),
      }))
      .filter(({ value }) => value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, MATCH_TAGS)
      .map(({ tagid }) => tagid);

    scored.push({
      candidate,
      score,
      similarity,
      vector,
      becauseOf,
      matchTagIds,
    });
  }

  return scored.sort((a, b) => b.score - a.score);
};

const creditedTo = (item: ScoredCandidate) =>
  item.candidate.developers[0] ?? item.candidate.publishers[0] ?? null;

/**
 * Picks greedily: each time the game that scores best and is least like what
 * is already picked. A played game explains at most three results in the
 * first dozen, and a developer two; the allowance grows as the list does, and
 * what the allowance held back follows at the end.
 */
export const diversify = (
  ranked: readonly ScoredCandidate[],
  limit: number
): ScoredCandidate[] => {
  const picked: ScoredCandidate[] = [];
  const left = new Set(ranked.map((_, index) => index));
  const closest = ranked.map(() => 0);
  const perSeed = new Map<string, number>();
  const perDeveloper = new Map<string, number>();

  while (picked.length < limit && left.size > 0) {
    const blocks = Math.floor(picked.length / PER_SEED_BLOCK);
    const seedLimit = PER_SEED * (1 + blocks);
    const developerLimit = PER_DEVELOPER * (1 + blocks);

    let best = -1;
    let bestValue = -Infinity;
    for (const index of left) {
      const item = ranked[index];
      const seedKey = item.becauseOf?.key;
      const developer = creditedTo(item);
      if (seedKey && (perSeed.get(seedKey) ?? 0) >= seedLimit) continue;
      if (developer && (perDeveloper.get(developer) ?? 0) >= developerLimit)
        continue;

      const value =
        (1 - DIVERSITY_WEIGHT) * item.score - DIVERSITY_WEIGHT * closest[index];
      if (value > bestValue) {
        bestValue = value;
        best = index;
      }
    }

    if (best === -1) break;

    const chosen = ranked[best];
    left.delete(best);
    picked.push(chosen);
    if (chosen.becauseOf) {
      perSeed.set(
        chosen.becauseOf.key,
        (perSeed.get(chosen.becauseOf.key) ?? 0) + 1
      );
    }
    const developer = creditedTo(chosen);
    if (developer)
      perDeveloper.set(developer, (perDeveloper.get(developer) ?? 0) + 1);

    for (const index of left) {
      closest[index] = Math.max(
        closest[index],
        dot(ranked[index].vector, chosen.vector)
      );
    }
  }

  // What the allowance held back still beats nothing.
  for (const index of [...left].sort((a, b) => a - b)) {
    if (picked.length >= limit) break;
    picked.push(ranked[index]);
  }
  return picked;
};

export const toRecommendation = (item: ScoredCandidate): Recommendation => {
  const { candidate } = item;
  return {
    appId: candidate.appId,
    title: candidate.title,
    headerImageUrl: candidate.headerImageUrl,
    score: item.score,
    tagIds: candidate.tags.map((tag) => tag.tagid),
    reviewPercent: candidate.reviewPercent,
    reviewCount: candidate.reviewCount,
    reviewLabel: candidate.reviewLabel,
    criticScore: candidate.criticScore ?? null,
    releaseYear: releaseYear(candidate),
    becauseOf: item.becauseOf,
    matchTagIds: item.matchTagIds,
  };
};
