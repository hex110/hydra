/** Steam's own sorts for its store search. */
export type SteamSearchSort =
  | "Reviews_DESC"
  | "Released_DESC"
  | "Released_ASC"
  | "Name_ASC"
  | "Name_DESC";

export interface SteamSearchQuery {
  /** Words in the title. */
  term?: string;
  /** A game must carry all of these tags. */
  tags?: number[];
  /** A game must carry none of these tags. */
  untags?: number[];
  sortBy?: SteamSearchSort;
  /** Steam's named lists, e.g. the most followed upcoming games. */
  filter?: "popularcomingsoon";
  /** Steam player categories a game must have, e.g. 2 single-player, 9 co-op. */
  categories?: number[];
  start?: number;
  /** At most 100. */
  count?: number;
}

export const STEAM_SEARCH_PAGE = 100;
/** Steam's category for games, leaving out software, soundtracks and bundles. */
const GAMES_ONLY = "998";

export const buildSteamSearchParams = (
  query: SteamSearchQuery
): Record<string, string> => {
  const params: Record<string, string> = {
    query: "",
    infinite: "1",
    cc: "us",
    l: "english",
    category1: GAMES_ONLY,
    start: String(Math.max(0, query.start ?? 0)),
    count: String(
      Math.min(STEAM_SEARCH_PAGE, Math.max(1, query.count ?? STEAM_SEARCH_PAGE))
    ),
  };
  if (query.term?.trim()) params.term = query.term.trim();
  if (query.tags?.length) params.tags = query.tags.join(",");
  if (query.untags?.length) params.untags = query.untags.join(",");
  if (query.sortBy) params.sort_by = query.sortBy;
  if (query.filter) params.filter = query.filter;
  if (query.categories?.length) params.category3 = query.categories.join(",");
  return params;
};

/**
 * The app ids in a store search answer, in Steam's order. Rows for bundles
 * carry several ids and are skipped. Null when the answer is not a search
 * page (Steam changed it, or it failed).
 */
export const parseSteamSearchResponse = (
  body: unknown
): { total: number; appIds: string[] } | null => {
  if (!body || typeof body !== "object") return null;
  const { results_html: html, total_count: total } = body as {
    results_html?: unknown;
    total_count?: unknown;
  };
  if (typeof html !== "string") return null;

  const appIds: string[] = [];
  for (const match of html.matchAll(/data-ds-appid="([\d,]+)"/g)) {
    const id = match[1];
    if (!id.includes(",") && !appIds.includes(id)) appIds.push(id);
  }
  return { total: typeof total === "number" ? total : appIds.length, appIds };
};
