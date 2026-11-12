import type { HowLongToBeatCategory } from "@types";
import { isSameTitle } from "./title-matching.js";

/** One game in HowLongToBeat's site search; times are in seconds. */
export interface HowLongToBeatSearchEntry {
  game_name?: string;
  game_alias?: string;
  game_type?: string;
  comp_main?: number;
  comp_plus?: number;
  comp_100?: number;
  count_comp?: number;
}

const HALF_HOUR = 0.5;

/** "12½ Hours" or "45 Mins", the way the Hydra API words it; "--" for none. */
export const formatHowLongToBeatSeconds = (seconds: unknown): string => {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0)
    return "--";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${Math.max(minutes, 1)} Mins`;

  const hours = Math.round(minutes / 60 / HALF_HOUR) * HALF_HOUR;
  const whole = Math.floor(hours);
  const half = hours - whole >= HALF_HOUR ? "½" : "";
  return `${whole > 0 ? whole : ""}${half} Hours`;
};

const matchesTitle = (entry: HowLongToBeatSearchEntry, title: string) =>
  [entry.game_name, entry.game_alias]
    .flatMap((name) => (name ? name.split(",") : []))
    .some((name) => isSameTitle(name.trim(), title));

const hasTimes = (entry: HowLongToBeatSearchEntry) =>
  [entry.comp_main, entry.comp_plus, entry.comp_100].some(
    (seconds) => typeof seconds === "number" && seconds > 0
  );

/**
 * The entry for `title`, or null. Only a same-title entry counts: a wrong
 * game's hours are worse than none. Entries without times are skipped, and
 * among several matches the base game with most submissions wins.
 */
export const pickHowLongToBeatEntry = (
  entries: HowLongToBeatSearchEntry[] | null | undefined,
  title: string
): HowLongToBeatSearchEntry | null => {
  const matches = (Array.isArray(entries) ? entries : []).filter(
    (entry) => entry && matchesTitle(entry, title) && hasTimes(entry)
  );

  return (
    matches.sort(
      (a, b) =>
        Number(b.game_type === "game") - Number(a.game_type === "game") ||
        (b.count_comp ?? 0) - (a.count_comp ?? 0)
    )[0] ?? null
  );
};

/** The Hydra API's category list for a site-search entry. */
export const howLongToBeatCategoriesFromEntry = (
  entry: HowLongToBeatSearchEntry
): HowLongToBeatCategory[] => [
  {
    title: "Main Story",
    duration: formatHowLongToBeatSeconds(entry.comp_main),
    accuracy: "00",
  },
  {
    title: "Main + Sides",
    duration: formatHowLongToBeatSeconds(entry.comp_plus),
    accuracy: "00",
  },
  {
    title: "Completionist",
    duration: formatHowLongToBeatSeconds(entry.comp_100),
    accuracy: "00",
  },
];
