import type { SteamTagWeight } from "../similar-games.js";
import {
  expandTagFamilies,
  IDLE_TAG_IDS,
  TAG_FAMILIES,
} from "../store-games.js";
import { tagVector, type TagVector } from "./vector.js";
import type {
  ProfileFamily,
  ProfileSeed,
  SeedInput,
  SeedNote,
  TasteProfile,
  TuneOptions,
} from "./types.js";

const IDLE_TAGS = new Set<number>(IDLE_TAG_IDS);

/** Idle games run in the background, so their hours are not attention. */
const IDLE_HOURS_SHARE = 0.1;
/** Idle tags count among a game's first tags only. */
const IDLE_DEPTH = 5;
/** Where a seed's tags are checked against the avoid list. */
const SEED_AVOID_DEPTH = 5;
const MAX_SEED_SHARE = 0.2;
const INTENT_WEIGHT = 0.3;
const FINISHED_MIN_WEIGHT = Math.log2(1 + 10);
const PROFILE_SEEDS = 20;
const PROFILE_TAGS = 15;
const DOMINANT_FAMILY_SHARE = 0.3;
/** Seeds whose lists and tags drive the search for candidates. */
export const RETRIEVAL_SEEDS = 8;

export const hasTagAmong = (
  tags: readonly SteamTagWeight[],
  ids: ReadonlySet<number>,
  depth: number
) => tags.slice(0, depth).some((tag) => ids.has(tag.tagid));

export const getAvoidedTags = (
  options: Pick<TuneOptions, "avoidTags" | "avoidRelated">
): Set<number> =>
  new Set(
    options.avoidRelated
      ? expandTagFamilies(options.avoidTags)
      : options.avoidTags
  );

export interface WeightedSeed extends ProfileSeed {
  tags: SteamTagWeight[];
  isIdle: boolean;
}

export interface BuiltProfile {
  profile: TasteProfile;
  /** The taste vector: what the person likes (positive) and dislikes (negative). */
  vector: TagVector;
  seeds: WeightedSeed[];
}

const ratingFactor = (rating: number): number => {
  if (rating >= 9) return 1.6;
  if (rating >= 7) return 1.25;
  if (rating >= 5) return 0.8;
  if (rating >= 3) return 0;
  return -0.5;
};

/** One game's weight, positive for what to find more of; null when it says nothing. */
const weighSeed = (
  seed: SeedInput,
  options: TuneOptions,
  isIdle: boolean
): { weight: number; notes: SeedNote[] } | null => {
  const notes: SeedNote[] = [];

  let hours =
    options.basedOn === "recent"
      ? seed.recentHours
      : seed.hours *
        (1 + (seed.hours > 0 ? Math.min(1, seed.recentHours / seed.hours) : 0));

  if (isIdle && options.idleDiscount) {
    hours *= IDLE_HOURS_SHARE;
    notes.push("idle");
  }

  let weight = hours > 0 ? Math.log2(1 + hours) : 0;

  if (seed.rating !== null) {
    const factor = ratingFactor(seed.rating);
    if (factor === 0) return null;
    weight = Math.max(weight, INTENT_WEIGHT) * factor;
    if (factor > 1) notes.push("rated-high");
    if (factor < 0) notes.push("rated-low");
  }

  if (seed.status === "finished" && weight > 0) {
    weight = Math.max(weight * 1.25, FINISHED_MIN_WEIGHT);
    notes.push("finished");
  } else if (seed.status === "dropped" && weight > 0) {
    weight *= -0.5;
    notes.push("dropped");
  } else if (weight === 0 && (seed.status === "backlog" || seed.wishlisted)) {
    weight = INTENT_WEIGHT;
    notes.push("intent");
  }

  return weight === 0 ? null : { weight, notes };
};

/** Cuts any game that supplies more than a fifth of all the weight, until none does (with five games or more). */
const capWeights = (weights: number[]): boolean[] => {
  const capped = weights.map(() => false);
  // Four games or fewer cannot each hold a fifth of the whole.
  if (weights.length < 5) return capped;
  const next = [...weights];

  for (let round = 0; round < 60; round++) {
    const total = next.reduce((sum, w) => sum + Math.abs(w), 0);
    const limit = MAX_SEED_SHARE * total;
    let changed = false;

    next.forEach((weight, index) => {
      if (Math.abs(weight) > limit * (1 + 1e-9)) {
        next[index] = Math.sign(weight) * limit;
        capped[index] = true;
        changed = true;
      }
    });
    if (!changed) break;
  }

  next.forEach((weight, index) => {
    weights[index] = weight;
  });
  return capped;
};

const familyShare = (
  family: readonly number[],
  vector: TagVector,
  positive: number
) =>
  positive > 0
    ? family.reduce((sum, id) => sum + Math.max(0, vector.get(id) ?? 0), 0) /
      positive
    : 0;

const findDominantFamily = (
  vector: TagVector,
  seeds: WeightedSeed[]
): ProfileFamily | null => {
  const positive = [...vector.values()].reduce(
    (sum, value) => sum + Math.max(0, value),
    0
  );

  let best: { family: readonly number[]; share: number } | null = null;
  for (const family of TAG_FAMILIES) {
    const share = familyShare(family, vector, positive);
    if (share > DOMINANT_FAMILY_SHARE && (!best || share > best.share)) {
      best = { family, share };
    }
  }
  if (!best) return null;

  const { family, share } = best;
  const tagId = family.reduce((top, id) =>
    (vector.get(id) ?? 0) > (vector.get(top) ?? 0) ? id : top
  );
  const mass = (seed: WeightedSeed) => {
    const own = tagVector(seed.tags);
    return (
      seed.weight *
      family.reduce((sum, id) => sum + Math.max(0, own.get(id) ?? 0), 0)
    );
  };
  const lead = seeds.reduce<WeightedSeed | null>(
    (top, seed) => (!top || mass(seed) > mass(top) ? seed : top),
    null
  );

  return {
    tagId,
    share,
    seedTitle: lead && mass(lead) > 0 ? lead.title : null,
    seedHours: lead && mass(lead) > 0 ? lead.hours : 0,
  };
};

/**
 * Learns what the person likes from their library: each game's weight comes
 * from playtime (idle games discounted), rating and status, no game supplies
 * more than a fifth of the whole, and the weighted tags of all of them make
 * the taste vector.
 */
export const buildTasteProfile = (
  inputs: readonly SeedInput[],
  options: TuneOptions
): BuiltProfile => {
  const avoided = getAvoidedTags(options);
  const picked = new Set(options.pickedGames);
  const excluded = new Set(options.excludedSeeds);

  const weighted: (Omit<WeightedSeed, "share"> & { share: number })[] = [];
  for (const input of inputs) {
    if (input.tags.length === 0) continue;
    if (excluded.has(input.key)) continue;
    if (options.basedOn === "picked" && !picked.has(input.key)) continue;
    if (hasTagAmong(input.tags, avoided, SEED_AVOID_DEPTH)) continue;

    const isIdle = hasTagAmong(input.tags, IDLE_TAGS, IDLE_DEPTH);
    const result = weighSeed(input, options, isIdle);
    if (!result) continue;

    const weight =
      options.basedOn === "picked"
        ? Math.max(1, Math.abs(result.weight))
        : result.weight;

    weighted.push({
      key: input.key,
      appId: input.appId,
      title: input.title,
      hours: input.hours,
      weight,
      share: 0,
      notes: result.notes,
      tags: input.tags,
      isIdle,
    });
  }

  const weights = weighted.map((seed) => seed.weight);
  const capped = capWeights(weights);
  const total = weights.reduce((sum, w) => sum + Math.abs(w), 0);

  const seeds: WeightedSeed[] = weighted
    .map((seed, index) => ({
      ...seed,
      weight: weights[index],
      share: total > 0 ? Math.abs(weights[index]) / total : 0,
      notes: capped[index] ? [...seed.notes, "capped" as const] : seed.notes,
    }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  const vector: TagVector = new Map();
  for (const seed of seeds) {
    for (const [tagid, value] of tagVector(seed.tags)) {
      vector.set(
        tagid,
        (vector.get(tagid) ?? 0) + (seed.weight * value) / total
      );
    }
  }

  // Tags the person asked for count double, and count even if the library has none.
  const topValue = Math.max(0, ...vector.values());
  for (const tagid of options.leanTags) {
    const own = vector.get(tagid) ?? 0;
    vector.set(tagid, own > 0 ? own * 2 : topValue * 0.5);
  }

  const positive = [...vector.values()].reduce(
    (sum, value) => sum + Math.max(0, value),
    0
  );
  const tags = [...vector]
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, PROFILE_TAGS)
    .map(([tagId, value]) => ({ tagId, share: value / positive }));

  return {
    profile: {
      seeds: seeds
        .slice(0, PROFILE_SEEDS)
        .map(({ tags: _tags, isIdle: _isIdle, ...seed }) => seed),
      tags,
      dominantFamily: findDominantFamily(vector, seeds),
      seedCount: seeds.length,
    },
    vector,
    seeds,
  };
};

/** The games whose lists and tags the search for candidates starts from. */
export const pickRetrievalSeeds = (
  seeds: readonly WeightedSeed[],
  options: Pick<TuneOptions, "idleDiscount">
): WeightedSeed[] =>
  seeds
    .filter((seed) => seed.weight > 0)
    .filter((seed) => !(options.idleDiscount && seed.isIdle))
    .slice(0, RETRIEVAL_SEEDS);
