import path from "node:path";
import { HydraApi } from "@main/services/hydra-api";
import { logger } from "@main/services/logger";
import { WindowManager } from "@main/services/window-manager";
import {
  ANKERGAMES_ORIGIN,
  parseHomeFeed,
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
const STEAM_DETAILS_BATCH = 10;

interface ResolvedEntry extends AnkerGamesFeedEntry {
  /** null when the game has no Steam app id, so it can't be opened in Hydra. */
  steamAppId: string | null;
  /** Steam's header image; new games' URLs carry a hash only Steam's data has. */
  imageUrl: string | null;
}

interface CachedFeed {
  fetchedAt: number;
  /** Some game pages could not be read, so the Steam ids are incomplete. */
  partial: boolean;
  trending: ResolvedEntry[];
  latest: ResolvedEntry[];
}

interface SteamDetailsEntry {
  objectId: string;
  data?: { data?: { name?: string; header_image?: string } } | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getFeedPath = () => path.join(getAnkerGamesDirectory(), "home.json");

const isSameLocalDay = (a: number, b: number) =>
  new Date(a).toDateString() === new Date(b).toDateString();

const steamHeaderUrl = (appId: string) =>
  `https://shared.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;

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
          },
        ]
      : []
  );

/**
 * The "Trending Games" and "Latest Games" rows of the AnkerGames home page,
 * read once per day (the first time Hydra starts that day) for the catalogue
 * front page. Games are opened by their Steam app id, which only the game
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

  /** Starts a read unless today's copy is complete or a try failed within the hour. */
  private static startRefresh() {
    const feed = this.cached ?? null;
    const current =
      feed && !feed.partial && isSameLocalDay(feed.fetchedAt, Date.now());
    if (current) return this.refreshing;
    if (this.refreshing) return this.refreshing;
    if (Date.now() - this.lastAttemptAt < RETRY_AFTER_FAILURE_MS) return null;

    this.lastAttemptAt = Date.now();
    this.refreshing = this.runRefresh().finally(() => {
      this.refreshing = null;
      // Also on failure, so a catalogue showing a loading state can stop.
      WindowManager.sendToAppWindows("on-ankergames-feed-updated");
    });
    return this.refreshing;
  }

  public static async refreshIfNewDay(): Promise<void> {
    if (!(await AnkerGamesCatalogue.isEnabled())) return;
    await this.load();
    await this.startRefresh();
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

  private static async runRefresh() {
    try {
      const response = await fetchAnkerGames(`${ANKERGAMES_ORIGIN}/`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const feed = parseHomeFeed(await response.text());
      if (feed.trending.length === 0 && feed.latest.length === 0) {
        throw new Error("The home page lists no games");
      }

      const { steamAppIds, partial } = await this.resolve([
        ...feed.trending,
        ...feed.latest,
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
        partial,
        trending: feed.trending.map(withSteamId),
        latest: feed.latest.map(withSteamId),
      };
      await writeJson(getFeedPath(), this.cached);
    } catch (error) {
      logger.warn("[AnkerGames] Could not read the home page", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * The rows from the last read, at once, and whether a newer read is running
   * (the catalogue is told when it ends) instead of holding the catalogue up.
   */
  public static async get(): Promise<AnkerGamesFeed> {
    const enabled = await AnkerGamesCatalogue.isEnabled();
    if (!enabled) {
      return {
        enabled,
        refreshing: false,
        fetchedAt: null,
        trending: [],
        latest: [],
      };
    }

    const feed = await this.load();
    void this.startRefresh();

    return {
      enabled,
      refreshing: this.refreshing !== null,
      fetchedAt: feed ? new Date(feed.fetchedAt).toISOString() : null,
      trending: toFeedGames(feed?.trending ?? []),
      latest: toFeedGames(feed?.latest ?? []),
    };
  }
}
