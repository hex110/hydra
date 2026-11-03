import axios from "axios";
import { steamBuildDatesSublevel } from "@main/level";
import { logger } from "./logger";

const INFO_URL = "https://api.steamcmd.net/v1/info/";
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
/** steamcmd.net is a volunteer service: one request a second. */
const GAP_MS = 1000;

let queue: Promise<unknown> = Promise.resolve();
const pending = new Map<string, Promise<number | null>>();

const afterGap = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(task);
  queue = run.then(
    () => new Promise((resolve) => setTimeout(resolve, GAP_MS)),
    () => new Promise((resolve) => setTimeout(resolve, GAP_MS))
  );
  return run;
};

/** Unix ms of the public build, null when Steam has none, undefined when steamcmd.net could not be reached. */
const request = async (appId: string): Promise<number | null | undefined> => {
  try {
    const response = await axios.get<{
      status?: string;
      data?: Record<
        string,
        {
          depots?: {
            branches?: { public?: { timebuildupdated?: string | number } };
          };
        }
      >;
    }>(`${INFO_URL}${appId}`, { timeout: REQUEST_TIMEOUT_MS });

    if (response.data?.status !== "success") return undefined;

    const updated = Number(
      response.data.data?.[appId]?.depots?.branches?.public?.timebuildupdated
    );
    return Number.isFinite(updated) && updated > 0 ? updated * 1000 : null;
  } catch (error) {
    logger.warn(`[SteamBuildDates] steamcmd.net failed for ${appId}`, error);
    return undefined;
  }
};

/**
 * When the public build of a game last changed, from steamcmd.net, a request a
 * second and kept for a week. Null when the date is unknown or the service
 * could not be reached; callers treat that as "not known", never as old.
 */
export const getLastBuildUpdate = async (
  appId: string
): Promise<number | null> => {
  const stored = await steamBuildDatesSublevel
    .get(appId)
    .catch(() => undefined);
  if (stored && Date.now() - stored.at < CACHE_MS) return stored.builtAt;

  const running = pending.get(appId);
  if (running) return running;

  const run = afterGap(async () => {
    const builtAt = await request(appId);
    if (builtAt === undefined) return null;

    await steamBuildDatesSublevel
      .put(appId, { at: Date.now(), builtAt })
      .catch((error) =>
        logger.warn("[SteamBuildDates] Could not keep a build date", error)
      );
    return builtAt;
  }).finally(() => pending.delete(appId));

  pending.set(appId, run);
  return run;
};
