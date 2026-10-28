import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import Skeleton from "react-loading-skeleton";
import { orderBy } from "lodash-es";
import {
  ChevronRightIcon,
  PlusIcon,
  QuestionIcon,
  SyncIcon,
} from "@primer/octicons-react";

import { Button } from "@renderer/components";
import { buildGameDetailsPath, ensureArray } from "@renderer/helpers";
import {
  useAppDispatch,
  useAppSelector,
  useLibrary,
  usePopularSteamTags,
  VERIFIED_POPULAR_TAGS,
} from "@renderer/hooks";
import { setFilters } from "@renderer/features";
import { logger } from "@renderer/logger";
import { CatalogueCategory, groupLibraryGames } from "@shared";
import type {
  AnkerGamesFeed,
  AnkerGamesFeedGame,
  CatalogueSearchResult,
  DownloadSource,
  GameShop,
  ShopAssets,
} from "@types";
import { usePlayActivity } from "../home/use-play-activity";
import { useHomeSuggestions } from "../home/use-home-suggestions";
import { catalogueKey } from "./catalogue-library-state";
import "./catalogue-front-page.scss";

const SHELF_SIZE = 12;
const SHELF_TAGS = 30;
/** Features and game modes: useful as filters, not for browsing. */
const SHELF_EXCLUDED_TAGS = new Set([
  "Singleplayer",
  "Multiplayer",
  "2D",
  "3D",
  "Early Access",
  "Free to Play",
]);
const CACHE_MS = 30 * 60 * 1000;

interface FrontPageGame {
  shop: GameShop;
  objectId: string;
  title: string;
  libraryImageUrl: string | null;
  /** Why the game is shown, e.g. "Because you played …". */
  reason?: string;
}

interface CatalogueFrontPageProps {
  downloadSources: DownloadSource[];
  ownedKeys: Set<string>;
}

// Kept while Hydra runs, so returning to the catalogue doesn't reflow the page.
const shelvesCache = new Map<
  string,
  { at: number; featured: FrontPageGame[]; newReleases: FrontPageGame[] }
>();

const toFrontPageGame = (
  game: Pick<ShopAssets, "shop" | "objectId" | "title" | "libraryImageUrl">,
  reason?: string
): FrontPageGame => ({
  shop: game.shop,
  objectId: game.objectId,
  title: game.title,
  libraryImageUrl: game.libraryImageUrl,
  reason,
});

const EMPTY_ANKERGAMES_FEED: AnkerGamesFeed = {
  enabled: false,
  refreshing: false,
  fetchedAt: null,
  trending: [],
  latest: [],
};

const fromAnkerGames = (game: AnkerGamesFeedGame): FrontPageGame =>
  toFrontPageGame(game, game.version ?? undefined);

function Capsule({ game }: Readonly<{ game: FrontPageGame }>) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className="catalogue-front-page__capsule"
      onClick={() => navigate(buildGameDetailsPath(game))}
      title={game.title}
    >
      {game.libraryImageUrl ? (
        <img src={game.libraryImageUrl} alt="" loading="lazy" />
      ) : (
        <span className="catalogue-front-page__capsule-placeholder">
          <QuestionIcon size={24} />
        </span>
      )}
      <span className="catalogue-front-page__capsule-title">{game.title}</span>
      {game.reason && (
        <span className="catalogue-front-page__capsule-reason">
          {game.reason}
        </span>
      )}
    </button>
  );
}

function Shelf({
  title,
  games,
  isLoading,
  isRefreshing = false,
}: Readonly<{
  title: string;
  games: FrontPageGame[];
  isLoading: boolean;
  /** Shows the games already known and says that newer ones are on the way. */
  isRefreshing?: boolean;
}>) {
  const { t } = useTranslation("catalogue");
  if (!isLoading && games.length === 0) return null;

  return (
    <section className="catalogue-front-page__shelf">
      <h2>
        {title}
        {isRefreshing && (
          <SyncIcon
            size={14}
            className="catalogue-front-page__refreshing"
            aria-label={t("ankergames_refreshing")}
          />
        )}
      </h2>
      <div className="catalogue-front-page__row">
        {isLoading
          ? Array.from({ length: 6 }).map((_, index) => (
              <Skeleton
                key={index}
                className="catalogue-front-page__capsule-skeleton"
              />
            ))
          : games.map((game) => (
              <Capsule key={catalogueKey(game)} game={game} />
            ))}
      </div>
    </section>
  );
}

function DiscoveryQueue({
  queue,
  onAdded,
}: Readonly<{ queue: FrontPageGame[]; onAdded: () => void }>) {
  const { t } = useTranslation("catalogue");
  const navigate = useNavigate();
  const [position, setPosition] = useState(0);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (position >= queue.length && queue.length > 0) setPosition(0);
  }, [position, queue.length]);

  if (queue.length === 0) return null;

  const game = queue[Math.min(position, queue.length - 1)];
  const next = () => setPosition((current) => (current + 1) % queue.length);

  const addToLibrary = async () => {
    setIsAdding(true);
    try {
      await window.electron.addGameToLibrary(
        game.shop,
        game.objectId,
        game.title,
        null
      );
      // Owned games leave the queue, so the next one moves into this place.
      onAdded();
    } catch (error) {
      logger.error("Failed to add game to library", error);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <section className="catalogue-front-page__shelf">
      <h2>{t("discovery_queue")}</h2>
      <div className="catalogue-front-page__queue">
        <button
          type="button"
          className="catalogue-front-page__queue-cover"
          onClick={() => navigate(buildGameDetailsPath(game))}
        >
          {game.libraryImageUrl ? (
            <img src={game.libraryImageUrl} alt={game.title} />
          ) : (
            <span className="catalogue-front-page__capsule-placeholder">
              <QuestionIcon size={32} />
            </span>
          )}
        </button>
        <div className="catalogue-front-page__queue-details">
          <span className="catalogue-front-page__queue-position">
            {t("discovery_queue_position", {
              position: Math.min(position, queue.length - 1) + 1,
              count: queue.length,
            })}
          </span>
          <h3>{game.title}</h3>
          {game.reason && <p>{game.reason}</p>}
          <div className="catalogue-front-page__queue-actions">
            <Button
              theme="outline"
              onClick={() => navigate(buildGameDetailsPath(game))}
            >
              {t("discovery_queue_open")}
            </Button>
            <Button theme="outline" onClick={addToLibrary} disabled={isAdding}>
              <PlusIcon size={16} />
              {t("discovery_queue_add")}
            </Button>
            <Button theme="primary" onClick={next}>
              {t("discovery_queue_next")}
              <ChevronRightIcon size={16} />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * What the catalogue shows before a search: featured games, what is new and
 * trending on AnkerGames, suggestions from your play history, new releases on
 * your sources, genres and a queue.
 */
export function CatalogueFrontPage({
  downloadSources,
  ownedKeys,
}: Readonly<CatalogueFrontPageProps>) {
  const { t, i18n } = useTranslation("catalogue");
  const dispatch = useAppDispatch();
  const { library, updateLibrary } = useLibrary();
  const { steamUserTags } = useAppSelector((state) => state.catalogueSearch);
  const popularTags = usePopularSteamTags();

  const groupedLibrary = useMemo(
    () => groupLibraryGames(library, []),
    [library]
  );
  const { recentPlayByKey } = usePlayActivity();
  const { suggestions, isLoading: isLoadingSuggestions } = useHomeSuggestions(
    groupedLibrary,
    recentPlayByKey
  );

  const sourcesKey = downloadSources.map((source) => source.id).join("|");
  const cachedShelves = shelvesCache.get(sourcesKey);
  const [featured, setFeatured] = useState(cachedShelves?.featured ?? []);
  const [newReleases, setNewReleases] = useState(
    cachedShelves?.newReleases ?? []
  );
  const [isLoading, setIsLoading] = useState(!cachedShelves);
  const [ankerGames, setAnkerGames] = useState<AnkerGamesFeed | null>(null);

  // The main process reads AnkerGames' home page once a day and says when a
  // new copy is ready, which can be after the catalogue is already open.
  useEffect(() => {
    let current = true;
    const load = () =>
      window.electron
        .getAnkerGamesFeed()
        .then((feed) => {
          if (current) setAnkerGames(feed);
        })
        .catch((error) => {
          logger.error("Failed to load the AnkerGames rows", error);
          if (current) setAnkerGames(EMPTY_ANKERGAMES_FEED);
        });

    void load();
    const unsubscribe = window.electron.onAnkerGamesFeedUpdated(load);
    return () => {
      current = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const cached = shelvesCache.get(sourcesKey);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      setFeatured(cached.featured);
      setNewReleases(cached.newReleases);
      setIsLoading(false);
      return;
    }

    let current = true;
    const sources = orderBy(downloadSources, "createdAt", "desc");
    const downloadSourceIds = sources.map((source) => source.id);
    const fingerprints = sources.flatMap((source) =>
      source.fingerprint ? [source.fingerprint] : []
    );

    const loadFeatured = window.electron.hydraApi
      .get<ShopAssets[]>(`/catalogue/${CatalogueCategory.Hot}`, {
        params: { take: SHELF_SIZE * 2, skip: 0, downloadSourceIds },
        needsAuth: false,
      })
      .then((games) =>
        ensureArray<ShopAssets>(games, "/catalogue/hot").map((game) =>
          toFrontPageGame(game)
        )
      );

    // Newest first across all of Steam is mostly games nobody has uploaded;
    // limiting to your sources keeps the ones you can download.
    const loadNewReleases =
      fingerprints.length === 0
        ? Promise.resolve([])
        : window.electron.hydraApi
            .post<{ edges: CatalogueSearchResult[] }>("/catalogue/search", {
              data: {
                title: "",
                sortBy: "releaseDate",
                sortOrder: "desc",
                downloadSourceFingerprints: fingerprints,
                tags: [],
                publishers: [],
                genres: [],
                developers: [],
                protondbSupportBadges: [],
                deckCompatibility: [],
                releaseYear: { lte: new Date().getFullYear() },
                take: SHELF_SIZE * 2,
                skip: 0,
                downloadSourceIds,
              },
              needsAuth: false,
            })
            .then((response) =>
              (response?.edges ?? []).map((game) => toFrontPageGame(game))
            );

    Promise.all([loadFeatured.catch(() => []), loadNewReleases.catch(() => [])])
      .then(([featuredGames, newGames]) => {
        if (featuredGames.length > 0 || newGames.length > 0) {
          shelvesCache.set(sourcesKey, {
            at: Date.now(),
            featured: featuredGames,
            newReleases: newGames,
          });
        }
        if (!current) return;
        setFeatured(featuredGames);
        setNewReleases(newGames);
      })
      .catch((error) =>
        logger.error("Failed to load catalogue front page", error)
      )
      .finally(() => {
        if (current) setIsLoading(false);
      });

    return () => {
      current = false;
    };
    // Sources are identified by sourcesKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesKey]);

  const notOwned = (games: FrontPageGame[]) =>
    games
      .filter((game) => !ownedKeys.has(catalogueKey(game)))
      .slice(0, SHELF_SIZE);

  // The site's rows as they are: games you own stay, and nothing is cut.
  const ankerGamesRow = (games: AnkerGamesFeedGame[] = []) =>
    games.map(fromAnkerGames);
  const ankerGamesLoading = (games: AnkerGamesFeedGame[] = []) =>
    ankerGames === null || (ankerGames.refreshing && games.length === 0);

  const recommended = useMemo(
    () =>
      suggestions.map(({ game, becauseOf }) =>
        toFrontPageGame(
          game,
          t("because_you_played", { ns: "home", title: becauseOf })
        )
      ),
    [suggestions, t]
  );

  const queue = useMemo(() => {
    const seen = new Set<string>();
    const games: FrontPageGame[] = [];
    for (const game of [...recommended, ...featured, ...newReleases]) {
      const key = catalogueKey(game);
      if (seen.has(key) || ownedKeys.has(key)) continue;
      seen.add(key);
      games.push(game);
    }
    return games;
  }, [recommended, featured, newReleases, ownedKeys]);

  const language = i18n.language.split("-")[0];
  const tags = useMemo(() => {
    const labels = new Map(
      Object.entries(steamUserTags[language] ?? {}).map(([name, id]) => [
        id,
        name,
      ])
    );

    return popularTags.tags
      .slice(0, VERIFIED_POPULAR_TAGS)
      .filter(
        (tag) =>
          !SHELF_EXCLUDED_TAGS.has(tag.name) && !popularTags.empty.has(tag.id)
      )
      .slice(0, SHELF_TAGS)
      .map((tag) => ({ id: tag.id, label: labels.get(tag.id) ?? tag.name }));
  }, [popularTags, steamUserTags, language]);

  let tagList: ReactNode = null;
  if (tags.length > 0) {
    tagList = (
      <section className="catalogue-front-page__shelf">
        <h2>{t("browse_by_tag")}</h2>
        <div className="catalogue-front-page__tags">
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className="catalogue-front-page__tag"
              onClick={() => dispatch(setFilters({ tags: [tag.id] }))}
            >
              {tag.label}
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="catalogue-front-page">
      <Shelf
        title={t("featured")}
        games={notOwned(featured)}
        isLoading={isLoading}
      />
      <Shelf
        title={t("ankergames_new")}
        games={ankerGamesRow(ankerGames?.latest)}
        isLoading={ankerGamesLoading(ankerGames?.latest)}
        isRefreshing={ankerGames?.refreshing}
      />
      <Shelf
        title={t("ankergames_trending")}
        games={ankerGamesRow(ankerGames?.trending)}
        isLoading={ankerGamesLoading(ankerGames?.trending)}
        isRefreshing={ankerGames?.refreshing}
      />
      <Shelf
        title={t("recommended_for_you")}
        games={notOwned(recommended)}
        isLoading={isLoadingSuggestions}
      />
      <DiscoveryQueue queue={queue} onAdded={updateLibrary} />
      <Shelf
        title={t("new_releases")}
        games={notOwned(newReleases)}
        isLoading={isLoading}
      />
      {tagList}
    </div>
  );
}
