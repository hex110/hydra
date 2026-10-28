export interface SteamSearchItem {
  id: number;
  name: string;
}

const EDITION =
  /\b(?:game of the year|goty|definitive|complete|enhanced|deluxe|ultimate|legendary|special|anniversary|gold|standard|directors cut) edition\b|\b(?:directors cut|remastered|remaster)\b/g;

const YEAR = /\(\s*(?:19|20)\d{2}\s*\)/g;

const strictForm = (title: string) =>
  title
    .replaceAll(/[™®©]/g, "")
    .normalize("NFKD")
    .replaceAll(/\p{M}/gu, "")
    .toLowerCase()
    .replaceAll(/['’`]/g, "")
    .replaceAll("&", " and ")
    .replaceAll(/[^a-z0-9]+/g, " ")
    .replace(/^the /, "")
    .trim();

const looseForm = (title: string) =>
  strictForm(title.replaceAll(YEAR, " "))
    .replaceAll(EDITION, " ")
    .replaceAll(/\s+/g, " ")
    .trim();

/**
 * Picks the Steam app a review site's game title stands for. Only names that
 * are the same title count, so a sequel, DLC or soundtrack is never taken for
 * the game. An exact name beats one that only differs by an edition or
 * "Remastered" suffix; among equals, Steam's own relevance order decides.
 */
export const pickSteamTitleMatch = (
  title: string,
  items: SteamSearchItem[]
): SteamSearchItem | null => {
  for (const form of [strictForm, looseForm]) {
    const wanted = form(title);
    if (!wanted) return null;
    const match = items.find((item) => form(item.name) === wanted);
    if (match) return match;
  }
  return null;
};
