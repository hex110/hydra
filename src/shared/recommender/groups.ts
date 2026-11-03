import { expandTagFamilies, isMultiplayerLed } from "../store-games.js";
import type { SteamTagWeight } from "../similar-games.js";
import type { WeightedSeed } from "./profile.js";
import type { GroupGame, GroupProposal, ProfileGroup } from "./types.js";
import {
  dot,
  tagVector,
  toUnitVectorWithFallback,
  type TagVector,
} from "./vector.js";

const MAX_GROUPS = 8;
/** One group per this many games, roughly: 460 games make six. */
const GAMES_PER_GROUP_SQUARED = 12;
const MAX_ITERATIONS = 25;
/** A group holding less of the weight than this joins its nearest group. */
const MIN_GROUP_SHARE = 0.04;
const NAME_TAGS = 3;
/** A naming tag must be among the first ten tags of this share of the group (by weight). */
const NAME_COVERAGE = 0.25;
const NAME_DEPTH = 10;
/** How far down a candidate's tags an anchor may be. */
export const ANCHOR_DEPTH = 5;

/** A taste group with what scoring needs: its games, its taste and its anchors. */
export interface BuiltGroup {
  id: string;
  /** The tags that name the group; a suggestion must carry one (with its family). */
  anchors: number[];
  /** Games in the group, heaviest first; negative ones (dropped, rated low) pull away. */
  seeds: WeightedSeed[];
  /** The weighted tags of its games, as `buildTasteProfile` makes the whole taste. */
  vector: TagVector;
  hours: number;
  weight: number;
  share: number;
  /** Anchors must be the rarest of a single game's tags (By game) rather than any of the group's. */
  rarestAnchorOnly: boolean;
  /** Its multiplayer-led games were taken out, and its suggestions must be singleplayer. */
  leaveOutMultiplayer?: boolean;
  isCustom?: boolean;
  isHidden?: boolean;
}

const groupId = (anchors: number[]) => `g-${[...anchors].sort().join("-")}`;

/** A rarity for tags the catalogue counts don't know: about as rare as the median. */
const fallbackRarity = (idf: ReadonlyMap<number, number>) => {
  const values = [...idf.values()].sort((a, b) => a - b);
  return values.length > 0 ? values[Math.floor(values.length / 2)] : 1;
};

const unit = (
  tags: readonly SteamTagWeight[],
  idf: ReadonlyMap<number, number>,
  fallback: number
) => toUnitVectorWithFallback(tagVector(tags), idf, fallback);

const centroid = (members: { vector: TagVector; weight: number }[]) => {
  const sum: TagVector = new Map();
  for (const { vector, weight } of members) {
    for (const [tag, value] of vector) {
      sum.set(tag, (sum.get(tag) ?? 0) + weight * value);
    }
  }
  let length = 0;
  for (const value of sum.values()) length += value * value;
  length = Math.sqrt(length);
  if (length === 0) return sum;
  for (const [tag, value] of sum) sum.set(tag, value / length);
  return sum;
};

const weightedTags = (seeds: readonly WeightedSeed[]) => {
  const total = seeds.reduce((sum, seed) => sum + Math.abs(seed.weight), 0);
  const vector: TagVector = new Map();
  if (total === 0) return vector;
  for (const seed of seeds) {
    for (const [tag, value] of tagVector(seed.tags)) {
      vector.set(tag, (vector.get(tag) ?? 0) + (seed.weight * value) / total);
    }
  }
  return vector;
};

/**
 * The three tags that say most about a group: common in the group and rare
 * in the catalogue (lift), each carried near the top by a fair share of its
 * games, and not two of one family (Roguelike and Roguelite).
 */
const nameGroup = (
  seeds: readonly WeightedSeed[],
  idf: ReadonlyMap<number, number>,
  fallback: number
): number[] => {
  const positive = seeds.filter((seed) => seed.weight > 0);
  const total = positive.reduce((sum, seed) => sum + seed.weight, 0);
  if (total === 0) return [];

  const mass = new Map<number, number>();
  const coverage = new Map<number, number>();
  for (const seed of positive) {
    for (const [tag, value] of tagVector(seed.tags)) {
      mass.set(tag, (mass.get(tag) ?? 0) + seed.weight * value);
    }
    for (const tag of new Set(
      seed.tags.slice(0, NAME_DEPTH).map((entry) => entry.tagid)
    )) {
      coverage.set(tag, (coverage.get(tag) ?? 0) + seed.weight);
    }
  }
  const massTotal = [...mass.values()].reduce((sum, value) => sum + value, 0);
  const minCoverage = positive.length <= 3 ? 0 : NAME_COVERAGE * total;

  const ranked = [...mass]
    .filter(([tag]) => (coverage.get(tag) ?? 0) >= minCoverage)
    .map(([tag, value]) => ({
      tag,
      lift: (value / massTotal) * (idf.get(tag) ?? fallback),
    }))
    .sort((a, b) => b.lift - a.lift || a.tag - b.tag);

  const name: number[] = [];
  const taken = new Set<number>();
  for (const { tag } of ranked) {
    if (taken.has(tag)) continue;
    name.push(tag);
    expandTagFamilies([tag]).forEach((id) => taken.add(id));
    if (name.length === NAME_TAGS) break;
  }
  return name;
};

const toGroup = (
  seeds: WeightedSeed[],
  allWeight: number,
  idf: ReadonlyMap<number, number>,
  fallback: number
): BuiltGroup => {
  const sorted = [...seeds].sort(
    (a, b) => Math.abs(b.weight) - Math.abs(a.weight)
  );
  const anchors = nameGroup(sorted, idf, fallback);
  const weight = sorted.reduce((sum, seed) => sum + Math.abs(seed.weight), 0);
  return {
    id: groupId(anchors),
    anchors,
    seeds: sorted,
    vector: weightedTags(sorted),
    hours: sorted.reduce((sum, seed) => sum + seed.hours, 0),
    weight,
    share: allWeight > 0 ? weight / allWeight : 0,
    rarestAnchorOnly: false,
  };
};

/** How many groups a library of this many games makes. */
export const groupCountFor = (games: number) =>
  Math.min(
    MAX_GROUPS,
    Math.max(1, Math.round(Math.sqrt(games / GAMES_PER_GROUP_SQUARED)))
  );

type Point = {
  seed: WeightedSeed;
  weight: number;
  /** Tags and play mode, for grouping. */
  vector: TagVector;
  /** Tags alone, to judge how alike a group's games are. */
  tags: TagVector;
};
type Cluster = { centre: TagVector; members: Point[] };

/** Pseudo-tags for how a game is played; they split groups but never name them. */
const MODE_SINGLE = -1;
const MODE_MULTI = -2;
/** A play-mode dimension weighs as much as a game's leading tag. */
const MODE_WEIGHT = 1;
/** A group this spread out, with at least this many games, is split in two. */
const MIN_COHESION = 0.5;
const SPLIT_FROM_GAMES = 10;

/** A game's tags scaled by rarity, plus how it is played, as a unit vector for grouping. */
const clusterVector = (
  tags: readonly SteamTagWeight[],
  idf: ReadonlyMap<number, number>,
  fallback: number
) => {
  const vector = unit(tags, idf, fallback);
  if (vector.size === 0) return vector;
  const lead = Math.max(...vector.values());
  vector.set(
    isMultiplayerLed(tags) ? MODE_MULTI : MODE_SINGLE,
    lead * MODE_WEIGHT
  );
  let length = 0;
  for (const value of vector.values()) length += value * value;
  length = Math.sqrt(length);
  for (const [tag, value] of vector) vector.set(tag, value / length);
  return vector;
};

const weightOf = (cluster: Cluster) =>
  cluster.members.reduce((sum, point) => sum + point.weight, 0);

/**
 * How close a group's games sit to its centre by their tags alone, by
 * weight: 1 is identical. Play mode is left out, or every singleplayer game
 * would look alike.
 */
const cohesion = (cluster: Cluster) => {
  const total = weightOf(cluster);
  if (total === 0) return 1;
  const centre = centroid(
    cluster.members.map((point) => ({
      vector: point.tags,
      weight: point.weight,
    }))
  );
  return (
    cluster.members.reduce(
      (sum, point) => sum + point.weight * dot(centre, point.tags),
      0
    ) / total
  );
};

/**
 * Weighted spherical k-means, deterministic: started from the heaviest point,
 * then each time from the point least like the centres so far.
 */
const kMeans = (points: Point[], k: number): Cluster[] => {
  if (points.length === 0) return [];
  const heaviest = points.reduce((best, point) =>
    point.weight > best.weight ? point : best
  );
  let centres: TagVector[] = [heaviest.vector];
  while (centres.length < Math.min(k, points.length)) {
    let best = -1;
    let bestValue = -Infinity;
    points.forEach((point, index) => {
      const closest = Math.max(
        ...centres.map((centre) => dot(centre, point.vector))
      );
      const value = point.weight * (1 - closest);
      if (value > bestValue) {
        bestValue = value;
        best = index;
      }
    });
    if (best === -1 || bestValue <= 1e-9) break;
    centres.push(points[best].vector);
  }

  let assignment = points.map(() => -1);
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const next = points.map((point) => {
      let best = 0;
      let bestValue = -Infinity;
      centres.forEach((centre, index) => {
        const value = dot(centre, point.vector);
        if (value > bestValue) {
          bestValue = value;
          best = index;
        }
      });
      return best;
    });
    const changed = next.some((value, index) => value !== assignment[index]);
    assignment = next;
    centres = centres.map((centre, index) => {
      const members = points.filter((_, point) => assignment[point] === index);
      return members.length > 0 ? centroid(members) : centre;
    });
    if (!changed) break;
  }

  return centres
    .map((centre, index) => ({
      centre,
      members: points.filter((_, point) => assignment[point] === index),
    }))
    .filter((cluster) => cluster.members.length > 0);
};

const toPoints = (
  seeds: readonly WeightedSeed[],
  idf: ReadonlyMap<number, number>,
  fallback: number
): Point[] =>
  seeds
    .filter((seed) => seed.weight > 0)
    .map((seed) => ({
      seed,
      weight: seed.weight,
      vector: clusterVector(seed.tags, idf, fallback),
      tags: unit(seed.tags, idf, fallback),
    }))
    .filter((point) => point.vector.size > 0);

/** Clusters ready to be groups: broad ones split, small ones merged into their nearest. */
const clusterSeeds = (
  points: Point[],
  k: number,
  maxGroups = MAX_GROUPS
): Cluster[] => {
  let clusters = kMeans(points, k);

  // A group whose games sit far apart is two tastes; split the loosest first.
  for (;;) {
    if (clusters.length >= maxGroups) break;
    const loose = clusters
      .filter(
        (cluster) =>
          cluster.members.length >= SPLIT_FROM_GAMES &&
          cohesion(cluster) < MIN_COHESION
      )
      .sort((a, b) => cohesion(a) - cohesion(b))[0];
    if (!loose) break;
    const halves = kMeans(loose.members, 2);
    if (halves.length < 2) break;
    clusters = [...clusters.filter((cluster) => cluster !== loose), ...halves];
  }

  const positiveWeight = points.reduce((sum, point) => sum + point.weight, 0);
  for (;;) {
    if (clusters.length <= 1) break;
    const smallest = clusters.reduce((low, cluster) =>
      weightOf(cluster) < weightOf(low) ? cluster : low
    );
    if (weightOf(smallest) / positiveWeight >= MIN_GROUP_SHARE) break;

    const others = clusters.filter((cluster) => cluster !== smallest);
    const target = others.reduce((best, cluster) =>
      dot(cluster.centre, smallest.centre) > dot(best.centre, smallest.centre)
        ? cluster
        : best
    );
    target.members.push(...smallest.members);
    target.centre = centroid(target.members);
    clusters = others;
  }
  return clusters;
};

/**
 * Splits the library into groups of games with a taste in common: weighted
 * spherical k-means over each game's tags scaled by catalogue rarity and how
 * it is played (singleplayer or multiplayer), so the same library always
 * gives the same groups. Spread-out groups split, small groups join their
 * nearest neighbour; dropped and low-rated games join the group they are most
 * like and pull its taste away from themselves.
 */
export const groupSeeds = (
  seeds: readonly WeightedSeed[],
  idf: ReadonlyMap<number, number>
): BuiltGroup[] => {
  const fallback = fallbackRarity(idf);
  const points = toPoints(seeds, idf, fallback);
  if (points.length === 0) return [];

  const allWeight = seeds.reduce((sum, seed) => sum + Math.abs(seed.weight), 0);
  const clusters = clusterSeeds(points, groupCountFor(points.length));

  const members = clusters.map((cluster) =>
    cluster.members.map((point) => point.seed)
  );
  for (const seed of seeds.filter((entry) => entry.weight < 0)) {
    const vector = clusterVector(seed.tags, idf, fallback);
    if (vector.size === 0) continue;
    let best = 0;
    clusters.forEach((cluster, index) => {
      if (dot(cluster.centre, vector) > dot(clusters[best].centre, vector))
        best = index;
    });
    members[best].push(seed);
  }

  const groups = members
    .map((group) => toGroup(group, allWeight, idf, fallback))
    .sort((a, b) => b.weight - a.weight);

  // Two groups with the same name would share an id; the lighter one gets a suffix.
  const seen = new Map<string, number>();
  for (const group of groups) {
    const count = seen.get(group.id) ?? 0;
    seen.set(group.id, count + 1);
    if (count > 0) group.id = `${group.id}-${count + 1}`;
  }
  return groups;
};

/** A group with its multiplayer-led games taken out of its taste; the id stays, so its settings follow. */
export const withoutMultiplayer = (
  group: BuiltGroup,
  idf: ReadonlyMap<number, number>
): BuiltGroup => {
  const seeds = group.seeds.filter((seed) => !isMultiplayerLed(seed.tags));
  if (seeds.length === group.seeds.length || seeds.length === 0) return group;
  const rebuilt = toGroup(seeds, 0, idf, fallbackRarity(idf));
  return {
    ...rebuilt,
    id: group.id,
    share: group.share * (rebuilt.weight / Math.max(group.weight, 1e-9)),
    leaveOutMultiplayer: true,
  };
};

/** A group the person kept, from its games' keys; null when none of them is left in the library. */
export const buildCustomGroup = (
  custom: { id: string; gameKeys: string[]; tagIds: number[] },
  seeds: readonly WeightedSeed[],
  allWeight: number,
  idf: ReadonlyMap<number, number>
): BuiltGroup | null => {
  const keys = new Set(custom.gameKeys);
  const members = seeds.filter((seed) => keys.has(seed.key));
  if (members.length === 0) return null;
  const group = toGroup(members, allWeight, idf, fallbackRarity(idf));
  return {
    ...group,
    id: custom.id,
    anchors: group.anchors.length > 0 ? group.anchors : custom.tagIds,
    isCustom: true,
  };
};

const EXAMPLES = 5;

const toProposal = (
  members: Point[],
  idf: ReadonlyMap<number, number>,
  fallback: number,
  size?: GroupProposal["size"]
): GroupProposal => {
  const centre = centroid(members);
  const seeds = members.map((point) => point.seed);
  const examples = [...members]
    .sort(
      (a, b) =>
        b.weight * dot(centre, b.vector) - a.weight * dot(centre, a.vector)
    )
    .slice(0, EXAMPLES)
    .map((point) => ({
      key: point.seed.key,
      title: point.seed.title,
      hours: point.seed.hours,
    }));
  return {
    tagIds: nameGroup(seeds, idf, fallback),
    gameKeys: seeds.map((seed) => seed.key),
    examples,
    gameCount: seeds.length,
    size,
  };
};

/** Refine: a group's games as two or three sub-groups, each with the games that show it best. */
export const proposeRefinements = (
  group: Pick<BuiltGroup, "seeds">,
  idf: ReadonlyMap<number, number>
): GroupProposal[] => {
  const fallback = fallbackRarity(idf);
  const points = toPoints(group.seeds, idf, fallback);
  if (points.length < 4) return [];
  const k = points.length >= 30 ? 3 : 2;
  return kMeans(points, k)
    .sort((a, b) => weightOf(b) - weightOf(a))
    .map((cluster) => toProposal(cluster.members, idf, fallback));
};

const AROUND_SIZES: {
  size: NonNullable<GroupProposal["size"]>;
  minCosine: number;
  maxGames: number;
}[] = [
  { size: "tight", minCosine: 0.7, maxGames: 15 },
  { size: "medium", minCosine: 0.5, maxGames: 40 },
  { size: "broad", minCosine: 0.35, maxGames: 100 },
];

/** Build around games: a tight, a medium and a broad group of library games like the chosen ones. */
export const proposeAround = (
  seeds: readonly WeightedSeed[],
  pickedKeys: readonly string[],
  idf: ReadonlyMap<number, number>
): GroupProposal[] => {
  const fallback = fallbackRarity(idf);
  const points = toPoints(seeds, idf, fallback);
  const picked = points.filter((point) => pickedKeys.includes(point.seed.key));
  if (picked.length === 0) return [];
  const centre = centroid(picked.map((point) => ({ ...point, weight: 1 })));

  const ranked = points
    .map((point) => ({ point, similarity: dot(centre, point.vector) }))
    .sort((a, b) => b.similarity - a.similarity);

  const proposals: GroupProposal[] = [];
  let previous = 0;
  for (const { size, minCosine, maxGames } of AROUND_SIZES) {
    const members = ranked
      .filter(
        ({ point, similarity }) =>
          similarity >= minCosine || pickedKeys.includes(point.seed.key)
      )
      .slice(0, maxGames)
      .map(({ point }) => point);
    // A size that adds nothing over the smaller one isn't a choice.
    if (members.length <= previous) continue;
    previous = members.length;
    proposals.push(toProposal(members, idf, fallback, size));
  }
  return proposals;
};

/** A seed's anchors for By game: its first three tags that are rarer than the median of its tags, rarest first. */
export const seedAnchors = (
  tags: readonly SteamTagWeight[],
  idf: ReadonlyMap<number, number>
): number[] => {
  const fallback = fallbackRarity(idf);
  const own = [...tagVector(tags).keys()];
  if (own.length === 0) return [];
  const rarities = own
    .map((tag) => idf.get(tag) ?? fallback)
    .sort((a, b) => a - b);
  const median = rarities[Math.floor(rarities.length / 2)];
  const first = own.slice(0, 3);
  const rare = first.filter((tag) => (idf.get(tag) ?? fallback) >= median);
  return (rare.length > 0 ? rare : first.slice(0, 1)).sort(
    (a, b) => (idf.get(b) ?? fallback) - (idf.get(a) ?? fallback)
  );
};

/** Games mode: the chosen games as one group, anchored on each game's rarest leading tag. */
export const groupPickedGames = (
  seeds: readonly WeightedSeed[],
  idf: ReadonlyMap<number, number>
): BuiltGroup[] => {
  const positive = seeds.filter((seed) => seed.weight > 0);
  if (positive.length === 0) return [];
  const fallback = fallbackRarity(idf);
  const anchors = [
    ...new Set(
      positive.flatMap((seed) => seedAnchors(seed.tags, idf).slice(0, 1))
    ),
  ];
  const group = toGroup([...positive], positive.length, idf, fallback);
  return [
    {
      ...group,
      id: "picked",
      anchors: anchors.length > 0 ? anchors : group.anchors,
      share: 1,
      rarestAnchorOnly: true,
    },
  ];
};

/** Tags mode: one group made of the chosen tags alone. */
export const groupFromTags = (tagIds: readonly number[]): BuiltGroup[] => {
  if (tagIds.length === 0) return [];
  return [
    {
      id: "tags",
      anchors: [...tagIds],
      seeds: [],
      vector: new Map(tagIds.map((tag) => [tag, 1 / tagIds.length])),
      hours: 0,
      weight: 1,
      share: 1,
      rarestAnchorOnly: false,
    },
  ];
};

/** Whether a candidate carries one of the group's anchors (or a tag of its family) among its first five tags. */
export const fitsGroup = (
  candidateTags: readonly SteamTagWeight[],
  group: Pick<BuiltGroup, "anchors">
) => {
  if (group.anchors.length === 0) return true;
  const accepted = new Set(expandTagFamilies(group.anchors));
  return candidateTags
    .slice(0, ANCHOR_DEPTH)
    .some((tag) => accepted.has(tag.tagid));
};

/**
 * A small bonus for carrying a rare anchor high up: the rarer the anchor and
 * the nearer the top, the more.
 */
export const anchorBonus = (
  candidateTags: readonly SteamTagWeight[],
  group: Pick<BuiltGroup, "anchors">,
  idf: ReadonlyMap<number, number>
) => {
  if (group.anchors.length === 0) return 0;
  const fallback = fallbackRarity(idf);
  const maxIdf = Math.max(fallback, ...idf.values());
  let best = 0;
  candidateTags.slice(0, ANCHOR_DEPTH).forEach((tag, position) => {
    const anchor = group.anchors.find((id) =>
      expandTagFamilies([id]).includes(tag.tagid)
    );
    if (anchor === undefined) return;
    const value =
      ((idf.get(anchor) ?? fallback) / maxIdf) * (1 - position / ANCHOR_DEPTH);
    best = Math.max(best, value);
  });
  return best;
};

/** What the renderer is shown of a group. */
export const toProfileGroup = (group: BuiltGroup): ProfileGroup => {
  const total = group.seeds.reduce(
    (sum, seed) => sum + Math.abs(seed.weight),
    0
  );
  const games: GroupGame[] = group.seeds.map(({ tags: _tags, ...seed }) => ({
    ...seed,
    groupShare: total > 0 ? Math.abs(seed.weight) / total : 0,
  }));
  return {
    id: group.id,
    tagIds: group.anchors,
    games,
    hours: group.hours,
    share: group.share,
    isCustom: group.isCustom,
    isHidden: group.isHidden,
  };
};
