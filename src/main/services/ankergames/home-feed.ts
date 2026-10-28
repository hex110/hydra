import path from "node:path";
import { HydraApi } from "@main/services/hydra-api";
import { logger } from "@main/services/logger";
import { WindowManager } from "@main/services/window-manager";
import {
  ANKERGAMES_ORIGIN,
  parseLatestGames,
  parseTrendingChart,
  type AnkerGamesFeedEntry,
} from "@shared";
import type { AnkerGamesFeed, AnkerGamesFeedGame } from "@types";
import {
  AnkerGamesCatalogue,
  fetchAnkerGames,
  getAnkerGamesDirectory,
  readJson,
  writeJson,
} from "./catalogue";

const RETRY_AFTER_FAILURE_MS = 60 * 60 * 1000;
const RETRY_UNREAD_AFTER_MS = 10_000;
/** Each game costs a page read, so the chart is cut well short of its twenty places. */
const TRENDING_LIMIT = 16;

interface ResolvedEntry extends AnkerGamesFeedEntry {
  /** null when the game has no Steam app id, so it can't be opened in Hydra. */
  steamAppId: string | null;
  /** Steam's header image; new games' URLs carry a hash only Steam's data has. */
  imageUrl: string | null;
}

interface CachedFeed {
  fetchedAt: number;
  /** A page or some game pages could not be read, so a row is old or incomplete. */
  partial: boolean;
  trending: ResolvedEntry[];
  latest: ResolvedEntry[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getFeedPath = () => path.join(getAnkerGamesDirectory(), "home.json");

const isSameLocalDay = (a: number, b: number) =>
  new Date(a).toDateString() === new Date(b).toDateString();

const steamHeaderUrl = (appId: string) =>
  `https://shared.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;

const STEAM_DETAILS_BATCH = 10;

interface SteamDetailsEntry {
  objectId: string;
  data?: { data?: { name?: string; header_image?: string } } | null;
}

const toFeedGames = (entries: ResolvedEntry[]): AnkerGamesFeedGame[] =>
  entries.flatMap((entry) =>
    entry.steamAppId
      ? [
          {
            shop: "steam" as const,
            objectId: entry.steamAppId,
            title: entry.name,
            libraryImageUrl: entry.imageUrl ?? steamHeaderUrl(entry.steamAppId),
            version: entry.version,
            rank: entry.rank,
          },
        ]
      : []
  );

/**
 * AnkerGames' weekly trending chart and its latest games, read once per day
 * (the first time Hydra starts that day) for the catalogue front page. Games are opened by their Steam app id, which only the game
 * pages carry, so each is read once through the page cache.
 */
export class AnkerGamesHomeFeed {
  private static cached: CachedFeed | null | undefined;
  private static refreshing: Promise<void> | null = null;
  private static lastAttemptAt = 0;

  private static async load() {
    if (this.cached === undefined) {
      this.cached = await readJson<CachedFeed>(getFeedPath());
    }
    return this.cached;
  }

  private static isCurrent(feed: CachedFeed | null) {
    return (
      feed !== null &&
      !feed.partial &&
      isSameLocalDay(feed.fetchedAt, Date.now())
    );
  }

  /** Reads the home page unless today's copy is complete or a try failed within the hour. */
  public static async refreshIfNewDay(): Promise<void> {
    if (!(await AnkerGamesCatalogue.isEnabled())) return;
    if (this.isCurrent(await this.load())) return;
    if (Date.now() - this.lastAttemptAt < RETRY_AFTER_FAILURE_MS) {
      return this.refreshing ?? undefined;
    }

    this.lastAttemptAt = Date.now();
    this.refreshing ??= this.runRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private static async resolve(entries: AnkerGamesFeedEntry[]) {
    const steamAppIds = new Map<string, string | null>();
    const unread: string[] = [];
    for (const { slug } of entries) {
      if (steamAppIds.has(slug)) continue;
      const page = await AnkerGamesCatalogue.getPage(slug, { lane: "feed" });
      if (!page) unread.push(slug);
      steamAppIds.set(slug, page?.steamAppId ?? null);
    }

    // A rate limit on a burst of pages usually clears within seconds.
    if (unread.length > 0) await sleep(RETRY_UNREAD_AFTER_MS);
    let partial = false;
    for (const slug of unread) {
      const page = await AnkerGamesCatalogue.getPage(slug, {
        lane: "feed",
        fresh: true,
      });
      if (!page) partial = true;
      steamAppIds.set(slug, page?.steamAppId ?? null);
    }
    return { steamAppIds, partial };
  }

  /** Steam's name and header image per app id; empty when Hydra's API can't be reached. */
  private static async fetchSteamDetails(appIds: string[]) {
    const details = new Map<string, { name?: string; header_image?: string }>();
    for (let i = 0; i < appIds.length; i += STEAM_DETAILS_BATCH) {
      const entries = await HydraApi.post<SteamDetailsEntry[]>(
        "/games/shop-details",
        {
          shop: "steam",
          objectIds: appIds.slice(i, i + STEAM_DETAILS_BATCH),
          language: "en",
        },
        { needsAuth: false }
      ).catch((error: unknown) => {
        logger.warn("[AnkerGames] Could not read Steam details", error);
        return [];
      });
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (entry.data?.data) details.set(entry.objectId, entry.data.data);
      }
    }
    return details;
  }

  private static async readPage<T>(
    pathname: string,
    parse: (html: string) => T[]
  ): Promise<T[] | null> {
    try {
      const response = await fetchAnkerGames(`${ANKERGAMES_ORIGIN}${pathname}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const entries = parse(await response.text());
      if (entries.length === 0) throw new Error("The page lists no games");
      return entries;
    } catch (error) {
      logger.warn("[AnkerGames] Could not read a feed page", {
        pathname,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private static async runRefresh() {
    try {
      const previous = await this.load();
      const trending = await this.readPage("/trending", parseTrendingChart);
      const latest = await this.readPage("/", parseLatestGames);
      // A row that can't be read keeps its last copy until the next try.
      const rows = {
        trending: trending?.slice(0, TRENDING_LIMIT) ?? null,
        latest,
      };
      if (!rows.trending && !rows.latest) return;

      const { steamAppIds, partial } = await this.resolve([
        ...(rows.trending ?? []),
        ...(rows.latest ?? []),
      ]);
      const steamDetails = await this.fetchSteamDetails(
        [...steamAppIds.values()].filter((id) => id !== null)
      );
      const withSteamId = (entry: AnkerGamesFeedEntry): ResolvedEntry => {
        const steamAppId = steamAppIds.get(entry.slug) ?? null;
        const steam = steamAppId ? steamDetails.get(steamAppId) : undefined;
        return {
          ...entry,
          name: steam?.name ?? entry.name,
          steamAppId,
          imageUrl: steam?.header_image ?? null,
        };
      };

      this.cached = {
        fetchedAt: Date.now(),
        partial: partial || !rows.trending || !rows.latest,
        trending: rows.trending?.map(withSteamId) ?? previous?.trending ?? [],
        latest: rows.latest?.map(withSteamId) ?? previous?.latest ?? [],
      };
      await writeJson(getFeedPath(), this.cached);
      WindowManager.sendToAppWindows("on-ankergames-feed-updated");
    } catch (error) {
      logger.warn("[AnkerGames] Could not read the home feed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * The rows from the last read. With no copy yet, waits for the first read so
   * the catalogue can show a loading state instead of nothing.
   */
  public static async get(): Promise<AnkerGamesFeed> {
    const enabled = await AnkerGamesCatalogue.isEnabled();
    if (!enabled) {
      return { enabled, fetchedAt: null, trending: [], latest: [] };
    }

    const refresh = this.refreshIfNewDay();
    let feed = await this.load();
    if (!feed) {
      await refresh;
      feed = await this.load();
    }

    return {
      enabled,
      fetchedAt: feed ? new Date(feed.fetchedAt).toISOString() : null,
      trending: toFeedGames(feed?.trending ?? []),
      latest: toFeedGames(feed?.latest ?? []),
    };
  }
}
