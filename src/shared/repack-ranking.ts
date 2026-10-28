import type { GameRepack, UserPreferences } from "@types";
import { ANKERGAMES_SOURCE_ID } from "./ankergames.js";

export type RepackSortPreference = "newest" | "smallest";

export interface RepackPreferences {
  /** Download source ids, most preferred first; unlisted sources come after. */
  sourceOrder: string[];
  sortBy: RepackSortPreference;
  /** Words that rule a release out when its title contains one (any case). */
  excludedWords: string[];
  maxSizeInBytes: number | null;
}

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];

/** Reads sizes such as "86.5 GB" or "696,3 MB"; null when unknown. */
export const parseRepackSize = (size: string | null): number | null => {
  const match = /^([\d.,]+)\s*([a-z]+)$/i.exec(size?.trim() ?? "");
  if (!match) return null;
  const value = Number.parseFloat(match[1].replaceAll(",", "."));
  const unit = SIZE_UNITS.indexOf(
    match[2].toUpperCase().replace(/^([KMGT])IB$/, "$1B")
  );
  if (Number.isNaN(value) || unit === -1) return null;
  return Math.round(value * 1024 ** unit);
};

/** AnkerGames is not in the sources list the order is picked from, so it leads unless listed. */
const withAnkerGamesFirst = (sourceIds: string[]) =>
  sourceIds.includes(ANKERGAMES_SOURCE_ID)
    ? sourceIds
    : [ANKERGAMES_SOURCE_ID, ...sourceIds];

export const resolveRepackPreferences = (
  preferences: UserPreferences | null | undefined
): RepackPreferences => ({
  sourceOrder: withAnkerGamesFirst(
    preferences?.preferredDownloadSourceIds ?? []
  ),
  sortBy:
    preferences?.repackSortPreference === "smallest" ? "smallest" : "newest",
  excludedWords: (preferences?.repackExcludedWords ?? "")
    .split(",")
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean),
  maxSizeInBytes:
    preferences?.repackMaxSizeInGigabytes &&
    preferences.repackMaxSizeInGigabytes > 0
      ? preferences.repackMaxSizeInGigabytes * 1024 ** 3
      : null,
});

const uploadTime = (repack: Pick<GameRepack, "uploadDate">) => {
  const time = repack.uploadDate ? Date.parse(repack.uploadDate) : Number.NaN;
  return Number.isNaN(time) ? 0 : time;
};

/**
 * Orders the repacks the user could download by their preferences: usable
 * ones only, without excluded words or oversized releases, preferred sources
 * first, then newest or smallest. The first entry is the one to preselect.
 */
export const rankRepacks = <T extends GameRepack>(
  repacks: T[],
  preferences: RepackPreferences,
  isUsable: (repack: T) => boolean = () => true
): T[] => {
  const sourceRank = (repack: T) => {
    const index = preferences.sourceOrder.indexOf(repack.downloadSourceId);
    return index === -1 ? preferences.sourceOrder.length : index;
  };

  return repacks
    .filter((repack) => {
      if (!isUsable(repack)) return false;
      const title = repack.title.toLowerCase();
      if (preferences.excludedWords.some((word) => title.includes(word))) {
        return false;
      }
      const size = parseRepackSize(repack.fileSize);
      return (
        preferences.maxSizeInBytes === null ||
        size === null ||
        size <= preferences.maxSizeInBytes
      );
    })
    .sort((a, b) => {
      const bySource = sourceRank(a) - sourceRank(b);
      if (bySource !== 0) return bySource;

      if (preferences.sortBy === "smallest") {
        const sizeA = parseRepackSize(a.fileSize) ?? Number.POSITIVE_INFINITY;
        const sizeB = parseRepackSize(b.fileSize) ?? Number.POSITIVE_INFINITY;
        if (sizeA !== sizeB) return sizeA - sizeB;
      }

      return uploadTime(b) - uploadTime(a);
    });
};
