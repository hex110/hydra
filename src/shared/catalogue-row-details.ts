import { sourceMatchKey } from "./local-source-matching.js";

/** Extra data shown on a catalogue row, fetched once the row is on screen. */
export interface CatalogueRowDetails {
  criticScore: number | null;
  /** How Long to Beat's main story time, in hours. */
  howLongToBeatHours: number | null;
  /**
   * The median download size among the sources, in bytes. The smallest
   * upload is often a patch or fix rather than the game.
   */
  downloadSize: number | null;
  /** Screenshot thumbnails for hover previews. */
  screenshots: string[];
}

export const CATALOGUE_PREVIEW_SCREENSHOTS = 5;

interface RowDetailsInput {
  steamDetails?: {
    metacritic?: { score?: number } | null;
    screenshots?: { path_thumbnail?: string; path_full?: string }[];
  } | null;
  howLongToBeatHours?: number | null;
  downloadSizes?: (number | null)[];
}

export const buildCatalogueRowDetails = ({
  steamDetails,
  howLongToBeatHours,
  downloadSizes,
}: RowDetailsInput): CatalogueRowDetails => {
  const sizes = (downloadSizes ?? [])
    .filter((size): size is number => typeof size === "number" && size > 0)
    .sort((a, b) => a - b);
  const score = steamDetails?.metacritic?.score;

  return {
    criticScore: typeof score === "number" && score > 0 ? score : null,
    howLongToBeatHours: howLongToBeatHours ?? null,
    downloadSize:
      sizes.length > 0 ? sizes[Math.floor((sizes.length - 1) / 2)] : null,
    screenshots: (steamDetails?.screenshots ?? [])
      .map((shot) => shot.path_thumbnail ?? shot.path_full)
      .filter((url): url is string => Boolean(url))
      .slice(0, CATALOGUE_PREVIEW_SCREENSHOTS),
  };
};

/**
 * Sizes of the downloads named after the game. Sources match loosely
 * (Grand Theft Auto V also returns every Vice City release), so the rest
 * would skew the size.
 */
export const getMatchingDownloadSizes = (
  gameTitle: string,
  downloads: { title: string; size: number | null }[]
): (number | null)[] => {
  const key = sourceMatchKey(gameTitle);
  if (!key) return [];
  return downloads
    .filter((download) => sourceMatchKey(download.title) === key)
    .map((download) => download.size);
};

/** Metacritic's colour bands. */
export const getCriticScoreTone = (score: number) =>
  score >= 75 ? "good" : score >= 50 ? "mixed" : "bad";
