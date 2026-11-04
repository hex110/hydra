import fs from "node:fs";
import path from "node:path";

import axios from "axios";

import { appVersion } from "@main/constants";
import { thunderstoreGameSupport, type ThunderstoreSchema } from "@shared";
import type { GameSupportDefinition, ModLoaderSupport } from "@types";

import { logger } from "../../logger";
import { SystemPath } from "../../system-path";

/**
 * Thunderstore's ecosystem data: per game, its Steam ids, exe names, loader
 * and install rules. It has no licence file, so Hydra fetches it from the
 * public API and caches what it turned it into, never a bundled copy.
 */
const SCHEMA_URL =
  "https://thunderstore.io/api/experimental/schema/dev/latest/";
const REFRESH_MS = 7 * 24 * 60 * 60_000;
const FIRST_FETCH_WAIT_MS = 15_000;
const headers = { "User-Agent": `HydraPlus/${appVersion}` };

interface Cache {
  fetchedAt: string;
  definitions: GameSupportDefinition[];
}

const cachePath = () =>
  path.join(SystemPath.getPath("userData"), "mods", "thunderstore-games.json");

let memory: Cache | null = null;
let refreshing: Promise<Cache | null> | null = null;

const readCache = async () => {
  if (memory) return memory;
  memory = await fs.promises
    .readFile(cachePath(), "utf8")
    .then((text) => JSON.parse(text) as Cache)
    .catch(() => null);
  return memory;
};

const refresh = () => {
  refreshing ??= (async () => {
    try {
      const response = await axios.get<ThunderstoreSchema>(SCHEMA_URL, {
        timeout: 60_000,
        headers,
      });
      const fetchedAt = new Date().toISOString();
      const cache: Cache = {
        fetchedAt,
        definitions: thunderstoreGameSupport(
          response.data,
          fetchedAt.slice(0, 10)
        ),
      };
      await fs.promises.mkdir(path.dirname(cachePath()), { recursive: true });
      await fs.promises.writeFile(cachePath(), JSON.stringify(cache));
      memory = cache;
      logger.info("[Mods] Thunderstore game list refreshed", {
        games: cache.definitions.length,
      });
      return cache;
    } catch (error) {
      logger.warn("[Mods] Could not fetch Thunderstore's game list", error);
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
};

export const ThunderstoreGames = {
  /** The cached definitions, refreshed weekly; the first fetch is waited for briefly. */
  async list(): Promise<GameSupportDefinition[]> {
    const cache = await readCache();
    const stale =
      !cache || Date.now() - Date.parse(cache.fetchedAt) > REFRESH_MS;
    if (!stale) return cache.definitions;
    const pending = refresh();
    if (cache) return cache.definitions;
    const first = await Promise.race([
      pending,
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), FIRST_FETCH_WAIT_MS)
      ),
    ]);
    return first?.definitions ?? [];
  },
};

/** The download link and version of a game's loader package on Thunderstore. */
export const resolveThunderstoreLoader = async (
  loader: ModLoaderSupport
): Promise<{ url: string; version: string; fileName: string }> => {
  const pack = loader.package;
  if (pack.kind !== "thunderstore")
    throw new Error("not a Thunderstore loader");
  const candidates = new Set(pack.packageIds);
  const search = loader.kind === "melonloader" ? "MelonLoader" : "BepInEx";
  const listing = await axios.get<{
    results: { namespace: string; name: string; download_count: number }[];
  }>(
    `https://thunderstore.io/api/cyberstorm/listing/${encodeURIComponent(pack.community)}/`,
    { params: { q: search, page_size: 50 }, timeout: 20_000, headers }
  );
  const best = listing.data.results
    .filter((item) => candidates.has(`${item.namespace}-${item.name}`))
    .toSorted((a, b) => b.download_count - a.download_count)[0];
  if (!best)
    throw new Error(
      `Thunderstore lists no ${loader.name} package for ${pack.community}`
    );
  const detail = await axios.get<{
    latest: { version_number: string; download_url: string; full_name: string };
  }>(
    `https://thunderstore.io/api/experimental/package/${encodeURIComponent(best.namespace)}/${encodeURIComponent(best.name)}/`,
    { timeout: 20_000, headers }
  );
  return {
    url: detail.data.latest.download_url,
    version: detail.data.latest.version_number,
    fileName: `${detail.data.latest.full_name}.zip`,
  };
};
