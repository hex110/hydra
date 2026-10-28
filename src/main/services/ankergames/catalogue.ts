import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db, levelKeys } from "@main/level";
import { logger } from "@main/services/logger";
import { SystemPath } from "@main/services/system-path";
import { getSourceSession } from "@main/services/local-sources/source-session";
import {
  ANKERGAMES_ORIGIN,
  ankerGamesPageUri,
  parseGamePage,
  parseGameSitemap,
  parseSitemapIndex,
  slugMatchKey,
  sourceMatchKey,
  toAnkerGamesRepack,
  type AnkerGamesGamePage,
  type AnkerGamesSitemapEntry,
} from "@shared";
import type { AnkerGamesStatus, GameRepack, UserPreferences } from "@types";

const CATALOGUE_TTL_MS = 24 * 60 * 60 * 1000;
const PAGE_TTL_MS = 24 * 60 * 60 * 1000;
const FAILED_PAGE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30_000;
/** Gap between game page requests, so an update check over a big library stays gentle. */
const PAGE_REQUEST_GAP_MS = 1000;

interface CachedCatalogue {
  fetchedAt: number;
  entries: AnkerGamesSitemapEntry[];
}

interface CachedPage {
  fetchedAt: number;
  /** null when the page could not be read. */
  page: AnkerGamesGamePage | null;
}

export const getAnkerGamesDirectory = () =>
  path.join(SystemPath.getPath("userData"), "ankergames");
const getCataloguePath = () =>
  path.join(getAnkerGamesDirectory(), "catalogue.json");
const getPagesPath = () => path.join(getAnkerGamesDirectory(), "pages.json");

export const readJson = async <T>(filePath: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.promises.readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
};

export const writeJson = async (filePath: string, value: unknown) => {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await fs.promises.writeFile(temporaryPath, JSON.stringify(value));
  await fs.promises.rename(temporaryPath, filePath);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchAnkerGames = async (url: string, init: RequestInit = {}) => {
  const response = await getSourceSession().fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.headers.get("cf-mitigated") === "challenge") {
    throw new Error("Blocked by a Cloudflare challenge");
  }
  return response;
};

const fetchText = async (url: string) => {
  const response = await fetchAnkerGames(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
};

/**
 * The AnkerGames catalogue, built from the site's public sitemaps and game
 * pages. It lists games only; download links are fetched when the person
 * starts a download (see `resolveAnkerGamesDownload`).
 */
export class AnkerGamesCatalogue {
  private static catalogue: CachedCatalogue | null = null;
  private static index: Map<string, AnkerGamesSitemapEntry[]> | null = null;
  private static pages: Record<string, CachedPage> | null = null;
  private static refreshing: Promise<void> | null = null;
  private static pageRequests: Promise<unknown> = Promise.resolve();
  private static lastError: string | null = null;

  public static async isEnabled() {
    const preferences = await db
      .get<string, UserPreferences | null>(levelKeys.userPreferences, {
        valueEncoding: "json",
      })
      .catch(() => null);
    return preferences?.ankerGamesSource !== false;
  }

  private static async load() {
    this.catalogue ??= await readJson<CachedCatalogue>(getCataloguePath());
    if (this.catalogue && !this.index) this.buildIndex(this.catalogue.entries);
    return this.catalogue;
  }

  private static buildIndex(entries: AnkerGamesSitemapEntry[]) {
    const index = new Map<string, AnkerGamesSitemapEntry[]>();
    for (const entry of entries) {
      const key = slugMatchKey(entry.slug);
      if (!key) continue;
      const bucket = index.get(key);
      if (bucket) bucket.push(entry);
      else index.set(key, [entry]);
    }
    this.index = index;
  }

  /** Reads the sitemaps again when the copy is missing, a day old or `force` is set. */
  public static refresh(force = false): Promise<void> {
    this.refreshing ??= this.runRefresh(force).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private static async runRefresh(force: boolean) {
    const cached = await this.load();
    if (!force && cached && Date.now() - cached.fetchedAt < CATALOGUE_TTL_MS) {
      return;
    }

    try {
      const sitemaps = parseSitemapIndex(
        await fetchText(`${ANKERGAMES_ORIGIN}/sitemap.xml`)
      );
      if (sitemaps.length === 0) throw new Error("No game sitemaps found");

      const entries: AnkerGamesSitemapEntry[] = [];
      for (const sitemap of sitemaps) {
        entries.push(...parseGameSitemap(await fetchText(sitemap)));
      }
      if (entries.length === 0) throw new Error("The sitemaps list no games");

      this.catalogue = { fetchedAt: Date.now(), entries };
      this.buildIndex(entries);
      this.lastError = null;
      await writeJson(getCataloguePath(), this.catalogue);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      logger.warn("[AnkerGames] Could not read the catalogue", {
        error: this.lastError,
      });
    }
  }

  public static async getStatus(): Promise<AnkerGamesStatus> {
    const catalogue = await this.load();
    return {
      enabled: await this.isEnabled(),
      refreshing: this.refreshing !== null,
      games: catalogue?.entries.length ?? 0,
      fetchedAt: catalogue ? new Date(catalogue.fetchedAt).toISOString() : null,
      error: this.lastError,
    };
  }

  private static async savePage(slug: string, cached: CachedPage) {
    this.pages![slug] = cached;
    await writeJson(getPagesPath(), this.pages).catch((error: unknown) =>
      logger.warn("[AnkerGames] Could not save page cache", error)
    );
  }

  /** A game page's details, from cache when fresh. One request at a time. */
  public static async getPage(
    slug: string,
    { fresh = false } = {}
  ): Promise<AnkerGamesGamePage | null> {
    this.pages ??= (await readJson(getPagesPath())) ?? {};
    const cached = this.pages[slug];
    if (cached && !fresh) {
      const ttl = cached.page ? PAGE_TTL_MS : FAILED_PAGE_TTL_MS;
      if (Date.now() - cached.fetchedAt < ttl) return cached.page;
    }

    const request = this.pageRequests.then(async () => {
      try {
        const page = parseGamePage(await fetchText(ankerGamesPageUri(slug)));
        await this.savePage(slug, { fetchedAt: Date.now(), page });
        return page;
      } catch (error) {
        logger.warn("[AnkerGames] Could not read game page", {
          slug,
          error: error instanceof Error ? error.message : String(error),
        });
        // An older copy beats none; only remember the failure when there is none.
        if (cached?.page) return cached.page;
        await this.savePage(slug, { fetchedAt: Date.now(), page: null });
        return null;
      } finally {
        await sleep(PAGE_REQUEST_GAP_MS);
      }
    });
    this.pageRequests = request.catch(() => null);
    return request;
  }

  /** AnkerGames releases of the game with this title. */
  public static async findRepacks(title: string): Promise<GameRepack[]> {
    const key = sourceMatchKey(title);
    if (!key || !(await this.isEnabled())) return [];

    const catalogue = await this.load();
    if (!catalogue) await this.refresh();
    else this.refresh().catch(() => null);

    const repacks: GameRepack[] = [];
    for (const entry of this.index?.get(key) ?? []) {
      const page = await this.getPage(entry.slug);
      // A page that loaded but shows no download button has nothing to offer.
      if (page && page.downloads.length === 0) continue;
      repacks.push(toAnkerGamesRepack(entry, page));
    }
    return repacks;
  }
}
