import axios from "axios";
import { steamSpyCacheSublevel, type SteamSpyGame } from "@main/level";
import { logger } from "./logger";

const API_URL = "https://steamspy.com/api.php";
const CACHE_MS = 24 * 60 * 60 * 1000;
const REQUEST_GAP_MS = 1100;
const TIMEOUT_MS = 90_000;
/** A whole tag list is 17 MB for Singleplayer; the top of it by players is all Charts reads. */
const KEEP_GAMES = 500;

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

/** SteamSpy asks for about one request a second, so requests wait their turn. */
const inQueue = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(async () => {
    const wait = lastRequestAt + REQUEST_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      return await task();
    } finally {
      lastRequestAt = Date.now();
    }
  });
  queue = run.catch(() => undefined);
  return run;
};

const toGames = (body: unknown): SteamSpyGame[] =>
  Object.values((body ?? {}) as Record<string, Record<string, unknown>>)
    .flatMap((entry) => {
      const appId = Number(entry?.appid);
      const ccu = Number(entry?.ccu);
      if (!appId || !Number.isFinite(ccu)) return [];

      return [
        {
          appId: String(appId),
          name: String(entry.name ?? ""),
          ccu,
          positive: Number(entry.positive) || 0,
          negative: Number(entry.negative) || 0,
        },
      ];
    })
    .sort((a, b) => b.ccu - a.ccu)
    .slice(0, KEEP_GAMES);

const load = async (
  cacheKey: string,
  params: Record<string, string>
): Promise<SteamSpyGame[] | null> => {
  const stored = await steamSpyCacheSublevel
    .get(cacheKey)
    .catch(() => undefined);
  if (stored && Date.now() - stored.at < CACHE_MS) return stored.games;

  try {
    const response = await inQueue(() =>
      axios.get(API_URL, { params, timeout: TIMEOUT_MS })
    );
    const games = toGames(response.data);
    if (games.length === 0) throw new Error("Empty answer");

    await steamSpyCacheSublevel
      .put(cacheKey, { at: Date.now(), games })
      .catch((error) =>
        logger.warn("[SteamSpy] Could not keep the list", error)
      );
    return games;
  } catch (error) {
    logger.warn(`[SteamSpy] ${cacheKey} request failed`, error);
    return stored?.games ?? null;
  }
};

/** The 500 games with the most players yesterday among those with a tag. Null when SteamSpy could not be reached. */
export const getSpyTag = (tag: string) =>
  load(`tag:${tag}`, { request: "tag", tag });

/** SteamSpy's own top 100 lists. */
export const getSpyTop = (list: "top100in2weeks" | "top100forever") =>
  load(list, { request: list });
