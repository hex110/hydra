import axios from "axios";
import {
  isSecondaryRelease,
  parseSteamMoreLikeThis,
  rankSimilarGames,
  type SteamSimilarGame,
  type SteamTagWeight,
} from "@shared";
import { logger } from "./logger";

const MORE_LIKE_THIS_URL =
  "https://store.steampowered.com/recommended/morelike/app";
const ITEMS_URL =
  "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/";
const ASSETS_URL = "https://shared.steamstatic.com/store_item_assets/";
const CACHE_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const RESULT_LIMIT = 24;
/** Steam's item type for a game; demos, DLC and soundtracks have others. */
const GAME_TYPE = 0;

interface StoreItem {
  success?: number;
  visible?: boolean;
  type?: number;
  appid?: number;
  name?: string;
  tags?: SteamTagWeight[];
  reviews?: { summary_filtered?: { review_count?: number } };
  assets?: Record<string, string>;
}

const cache = new Map<
  string,
  { at: number; value: Promise<SteamSimilarGame[] | null> }
>();

const assetUrl = (item: StoreItem, key: string) => {
  const format = item.assets?.asset_url_format;
  const file = item.assets?.[key];

  return format && file
    ? `${ASSETS_URL}${format.replace("${FILENAME}", file)}`
    : null;
};

const toSimilarGame = (item: StoreItem): SteamSimilarGame | null => {
  if (!item.appid || !item.name) return null;

  const objectId = String(item.appid);

  return {
    objectId,
    shop: "steam",
    title: item.name,
    iconUrl: null,
    libraryHeroImageUrl: assetUrl(item, "library_hero"),
    libraryImageUrl: assetUrl(item, "header"),
    coverImageUrl: assetUrl(item, "library_capsule_2x"),
    logoImageUrl: `${ASSETS_URL}steam/apps/${objectId}/logo_2x.png`,
    downloadSources: [],
  };
};

const fetchStoreItems = async (appIds: string[]) => {
  const response = await axios.get(ITEMS_URL, {
    params: {
      input_json: JSON.stringify({
        ids: appIds.map((appid) => ({ appid: Number(appid) })),
        context: { language: "english", country_code: "US" },
        data_request: {
          include_assets: true,
          include_tag_count: 20,
          include_reviews: true,
        },
      }),
    },
    timeout: REQUEST_TIMEOUT_MS,
  });

  return (response.data?.response?.store_items ?? []) as StoreItem[];
};

const loadSimilarGames = async (appId: string) => {
  const page = await axios.get<string>(`${MORE_LIKE_THIS_URL}/${appId}`, {
    params: { l: "english" },
    headers: {
      // Skips the age gate, as Hydra's catalogue does not hide adult games.
      Cookie:
        "birthtime=0; lastagecheckage=1-January-1990; wants_mature_content=1",
    },
    responseType: "text",
    timeout: REQUEST_TIMEOUT_MS,
  });

  const candidateIds = parseSteamMoreLikeThis(page.data).filter(
    (id) => id !== appId
  );
  if (candidateIds.length === 0) return null;

  const items = await fetchStoreItems([appId, ...candidateIds]);
  const byId = new Map(items.map((item) => [String(item.appid), item]));
  const source = byId.get(appId);
  if (!source?.tags?.length) return null;

  const candidates = candidateIds.flatMap((id) => {
    const item = byId.get(id);
    const isGame =
      item?.success === 1 &&
      item.visible !== false &&
      item.type === GAME_TYPE &&
      !isSecondaryRelease(item.name ?? "");
    const game = isGame ? toSimilarGame(item) : null;

    return item && game
      ? [
          {
            game,
            tags: item.tags ?? [],
            reviewCount: item.reviews?.summary_filtered?.review_count,
          },
        ]
      : [];
  });

  return rankSimilarGames(source.tags, candidates)
    .slice(0, RESULT_LIMIT)
    .map(({ game }) => game);
};

/**
 * Games Steam lists under "More like this", re-ranked by tag similarity.
 * Null when Steam has no list for the game or could not be reached.
 */
export const getSteamSimilarGames = (
  appId: string
): Promise<SteamSimilarGame[] | null> => {
  if (!/^\d+$/.test(appId)) return Promise.resolve(null);

  const cached = cache.get(appId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const value = loadSimilarGames(appId).catch((error) => {
    logger.warn(`Steam similar games failed for ${appId}`, error);
    cache.delete(appId);
    return null;
  });

  cache.set(appId, { at: Date.now(), value });
  return value;
};
