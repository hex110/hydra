import type { SteamTagWeight } from "../similar-games.js";
import { FEATURE_TAG_IDS } from "../store-games.js";

export type TagVector = Map<number, number>;

/** How many of a game's most voted tags describe it. */
export const TAG_DEPTH = 15;

/**
 * A game's tags as `sqrt(votes / top votes)` over the first fifteen, without
 * the tags that only name the format (Singleplayer, 2D, Early Access, …).
 */
export const tagVector = (
  tags: readonly SteamTagWeight[],
  depth = TAG_DEPTH
): TagVector => {
  const used = tags.slice(0, depth);
  const top = Math.max(1, ...used.map(({ weight }) => weight));
  const vector: TagVector = new Map();

  for (const { tagid, weight } of used) {
    if (FEATURE_TAG_IDS.has(tagid)) continue;
    vector.set(tagid, Math.sqrt(Math.max(0, weight) / top));
  }
  return vector;
};

/** Each tag counts for less the more games in the pool share it. */
export const buildIdf = (
  pool: readonly (readonly SteamTagWeight[])[]
): Map<number, number> => {
  const frequency = new Map<number, number>();
  for (const tags of pool) {
    for (const tagid of tagVector(tags).keys()) {
      frequency.set(tagid, (frequency.get(tagid) ?? 0) + 1);
    }
  }

  const idf = new Map<number, number>();
  for (const [tagid, count] of frequency) {
    idf.set(tagid, Math.log(1 + pool.length / count));
  }
  return idf;
};

/** Scales each tag by its rarity and the whole to length 1; tags nobody in the pool has are dropped. */
export const toUnitVector = (
  vector: TagVector,
  idf: ReadonlyMap<number, number>
): TagVector => {
  const scaled: TagVector = new Map();
  let sum = 0;

  for (const [tagid, value] of vector) {
    const rarity = idf.get(tagid);
    if (!rarity) continue;
    const next = value * rarity;
    scaled.set(tagid, next);
    sum += next * next;
  }

  const length = Math.sqrt(sum);
  if (length === 0) return new Map();
  for (const [tagid, value] of scaled) scaled.set(tagid, value / length);
  return scaled;
};

/** Cosine of two unit vectors. */
export const dot = (a: TagVector, b: TagVector) => {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let sum = 0;
  for (const [tagid, value] of small) sum += value * (large.get(tagid) ?? 0);
  return sum;
};
