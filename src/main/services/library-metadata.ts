import type {
  CatalogueGameIdentity,
  GameLibraryMetadata,
  HowLongToBeatCategory,
  ProtonDBData,
  SteamGenre,
} from "@types";
import {
  gameLibraryMetadataSublevel,
  gamesSublevel,
  levelKeys,
} from "@main/level";
import {
  getGameCatalogueIdentity,
  getGenreNames,
  isLibraryMetadataStale,
  LIBRARY_METADATA_MAX_AGE_MS,
  parseHowLongToBeat,
  parseReleaseDate,
} from "@shared";
import { HydraApi } from "./hydra-api";
import { logger } from "./logger";
import { WindowManager } from "./window-manager";

const REFRESH_DEBOUNCE_MS = 30_000;
const RETRY_PARTIAL_AFTER_MS = 24 * 60 * 60 * 1000;
const OFFLINE_BACKOFF_MS = 30 * 60 * 1000;
const CONCURRENCY = 3;
const STEAM_BATCH_SIZE = 30;

interface CatalogueGameRecord {
  genres?: string[];
  releaseDate?: string | null;
  averageReviewScore?: number | null;
  reviewCount?: number;
}

interface SteamShopDetailsEntry {
  objectId: string;
  data?: {
    data?: {
      genres?: SteamGenre[];
      metacritic?: { score?: number };
      release_date?: { date?: string };
    };
  } | null;
}

type SteamDetails = NonNullable<
  NonNullable<SteamShopDetailsEntry["data"]>["data"]
>;

const requestOptions = { needsAuth: false } as const;

const settle = <T>(promise: Promise<T>): Promise<T | undefined> =>
  promise.catch(() => undefined);

const fetchSteamDetails = async (
  objectIds: string[]
): Promise<Map<string, SteamDetails>> => {
  const details = new Map<string, SteamDetails>();

  for (let index = 0; index < objectIds.length; index += STEAM_BATCH_SIZE) {
    const batch = objectIds.slice(index, index + STEAM_BATCH_SIZE);
    const entries = await settle(
      HydraApi.post<SteamShopDetailsEntry[]>(
        "/games/shop-details",
        { shop: "steam", objectIds: batch, language: "en" },
        requestOptions
      )
    );

    for (const entry of Array.isArray(entries) ? entries : []) {
      if (entry?.data?.data) details.set(entry.objectId, entry.data.data);
    }
  }

  return details;
};

const fetchMetadata = async (
  identity: CatalogueGameIdentity,
  steamDetails: SteamDetails | undefined
): Promise<{ metadata: GameLibraryMetadata; complete: boolean } | null> => {
  const { shop, objectId } = identity;
  const base = `/games/${shop}/${encodeURIComponent(objectId)}`;
  const isPcGame = shop !== "launchbox";

  const [record, howLongToBeat, protonDb] = await Promise.all([
    settle(
      HydraApi.get<CatalogueGameRecord | null>(base, null, requestOptions)
    ),
    isPcGame
      ? settle(
          HydraApi.get<HowLongToBeatCategory[] | null>(
            `${base}/how-long-to-beat`,
            null,
            requestOptions
          )
        )
      : Promise.resolve(null),
    isPcGame && process.platform === "linux"
      ? settle(
          HydraApi.get<ProtonDBData | null>(
            `${base}/protondb`,
            null,
            requestOptions
          )
        )
      : Promise.resolve(null),
  ]);

  if (record === undefined && howLongToBeat === undefined && !steamDetails) {
    return null;
  }

  const genres = getGenreNames(record?.genres);

  return {
    metadata: {
      genres: genres.length > 0 ? genres : getGenreNames(steamDetails?.genres),
      releaseDate:
        parseReleaseDate(record?.releaseDate) ??
        parseReleaseDate(steamDetails?.release_date?.date),
      criticScore: steamDetails?.metacritic?.score ?? null,
      userScore:
        record?.reviewCount && typeof record.averageReviewScore === "number"
          ? record.averageReviewScore
          : null,
      protonDbTier: protonDb?.tier ?? null,
      howLongToBeat: parseHowLongToBeat(howLongToBeat),
      fetchedAt: Date.now(),
    },
    complete:
      record !== undefined &&
      howLongToBeat !== undefined &&
      protonDb !== undefined,
  };
};

/**
 * Keeps catalogue data (genres, scores, ProtonDB tier, How Long to Beat) for
 * every library game in a local cache, so the library can filter and sort by
 * it without a request per card.
 */
export class LibraryMetadata {
  private static timer: NodeJS.Timeout | null = null;
  private static running: Promise<void> | null = null;
  private static runAgain = false;
  private static offlineUntil = 0;

  static watch() {
    gamesSublevel.on("write", () => this.scheduleRefresh());
    this.scheduleRefresh();
  }

  /** Runs once after the delay; writes meanwhile (playtime ticks) don't push it back. */
  static scheduleRefresh() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refresh();
    }, REFRESH_DEBOUNCE_MS);
  }

  static async getAll(): Promise<Map<string, GameLibraryMetadata>> {
    return new Map(
      await gameLibraryMetadataSublevel
        .iterator()
        .all()
        .catch(() => [])
    );
  }

  static async refresh(): Promise<void> {
    if (this.running) {
      this.runAgain = true;
      return this.running;
    }

    this.running = this.refreshStale()
      .catch((error) => {
        logger.error("[LibraryMetadata] Refresh failed", error);
      })
      .finally(() => {
        this.running = null;
        if (this.runAgain) {
          this.runAgain = false;
          this.scheduleRefresh();
        }
      });

    return this.running;
  }

  private static async refreshStale() {
    if (Date.now() < this.offlineUntil) return;

    const [games, cached] = await Promise.all([
      gamesSublevel.values().all(),
      this.getAll(),
    ]);

    const stale = new Map<string, CatalogueGameIdentity>();
    for (const game of games) {
      if (game.isDeleted || game.shop === "custom") continue;
      const identity = getGameCatalogueIdentity(game);
      const key = levelKeys.game(identity.shop, identity.objectId);
      if (isLibraryMetadataStale(cached.get(key))) stale.set(key, identity);
    }

    if (stale.size === 0) return;

    logger.info(`[LibraryMetadata] Fetching metadata for ${stale.size} games`);

    const steamDetails = await fetchSteamDetails(
      [...stale.values()]
        .filter((identity) => identity.shop === "steam")
        .map((identity) => identity.objectId)
    );

    const queue = [...stale.entries()];
    let fetched = 0;
    let failed = 0;

    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const [key, identity] = next;
        const result = await fetchMetadata(
          identity,
          identity.shop === "steam"
            ? steamDetails.get(identity.objectId)
            : undefined
        );

        if (!result) {
          failed++;
          continue;
        }

        // A partial result is kept, and retried a day later instead of a week.
        const metadata = result.complete
          ? result.metadata
          : {
              ...result.metadata,
              fetchedAt:
                result.metadata.fetchedAt -
                LIBRARY_METADATA_MAX_AGE_MS +
                RETRY_PARTIAL_AFTER_MS,
            };

        await gameLibraryMetadataSublevel.put(key, metadata);
        fetched++;
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    if (fetched === 0 && failed > 0) {
      this.offlineUntil = Date.now() + OFFLINE_BACKOFF_MS;
      logger.warn("[LibraryMetadata] Catalogue unreachable, retrying later");
      return;
    }

    logger.info(
      `[LibraryMetadata] Updated ${fetched} games, ${failed} without data`
    );
    WindowManager.sendToAppWindows("on-library-batch-complete");
  }
}
