import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { orderBy } from "lodash-es";
import { ChevronRightIcon, PlusIcon, XIcon } from "@primer/octicons-react";

import {
  Button,
  StoreGameCard,
  StoreGameChip,
  StoreGameMeta,
  StoreShelf,
  type StoreGameFeedback,
} from "@renderer/components";
import { StoreGameCover } from "@renderer/components/store-game-card/store-game-cover";
import { Link } from "@renderer/components/link/link";
import {
  CatalogueCategory,
  FEATURE_TAG_IDS,
  type CatalogueChartId,
  type CatalogueChartRow,
  type Recommendation,
  type StoreGameFacts,
  type TuneOptions,
} from "@shared";
import { buildGameDetailsPath, ensureArray } from "@renderer/helpers";
import {
  useAppDispatch,
  useFormat,
  useLibrary,
  usePopularSteamTags,
} from "@renderer/hooks";
import {
  setCatalogueTab,
  setDiscoverView,
  setFilters,
} from "@renderer/features";
import { logger } from "@renderer/logger";
import type {
  AnkerGamesFeed,
  AnkerGamesFeedGame,
  CatalogueSearchResult,
  DownloadSource,
  GameShop,
  ShopAssets,
} from "@types";
import {
  catalogueKey,
  isOwnedLibraryState,
  type CatalogueLibraryState,
} from "./catalogue-library-state";
import {
  getGroupName,
  getRecommendationReason,
  toCardGame,
} from "./recommendation-card";
import {
  readCatalogueSnapshot,
  writeCatalogueSnapshot,
} from "./catalogue-snapshots";
import { useRecordImpressions } from "./use-impressions";
import { useSuggestionFeedback } from "./use-suggestion-feedback";
import { useAvoidFilter } from "./use-avoid-filter";
import { useFacetCounts } from "./use-facet-counts";
import { useCatalogueRowDetails } from "./use-catalogue-row-details";
import { useNotInterested } from "./use-not-interested";
import { useRecommendations } from "./use-recommendations";
import { useSteamTagLabels } from "./use-steam-tag-labels";
import { useTuneSettings } from "./use-tune-settings";
import "./catalogue-front-page.scss";

const SHELF_SIZE = 12;
/** Taste groups that get a shelf of their own on Discover. */
const GROUP_SHELVES = 3;
/** Common catalogue tags that make Outside your usual. */
const OUTSIDE_TAGS = 4;
const OUTSIDE_COMMON_TAGS = 20;
const SHELF_TAGS = 30;
const CACHE_MS = 30 * 60 * 1000;
const CHART_CACHE_MS = 5 * 60 * 1000;
const CHART_STORAGE_KEY = "catalogue-chart";
/** Games kept from a list so that hiding some still fills a shelf. */
const CANDIDATES = SHELF_SIZE * 2;

interface FrontPageGame {
  shop: GameShop;
  objectId: string;
  title: string;
  libraryImageUrl: string | null;
  /** Why the game is shown: the tags it shares with your taste. */
  reason?: string;
  reasonTitle?: string;
  releaseYear?: number | null;
  /** The version AnkerGames lists it at. */
  version?: string;
  /** Place on a chart. */
  rank?: number;
}

interface CatalogueFrontPageProps {
  downloadSources: DownloadSource[];
  libraryStates: Map<string, CatalogueLibraryState>;
  /** Leaves out games you own; the AnkerGames rows always show the site's list. */
  hideOwned: boolean;
}

// Kept while Hydra runs, so returning to the catalogue doesn't reflow the page.
const shelvesCache = new Map<
  string,
  { at: number; featured: FrontPageGame[]; newReleases: FrontPageGame[] }
>();

const chartCache = new Map<
  CatalogueChartId,
  { at: number; rows: CatalogueChartRow[] }
>();

const toFrontPageGame = (
  game: Pick<ShopAssets, "shop" | "objectId" | "title" | "libraryImageUrl">,
  extra: Partial<Omit<FrontPageGame, keyof ShopAssets>> = {}
): FrontPageGame => ({
  shop: game.shop,
  objectId: game.objectId,
  title: game.title,
  libraryImageUrl: game.libraryImageUrl,
  ...extra,
});

const EMPTY_ANKERGAMES_FEED: AnkerGamesFeed = {
  enabled: false,
  refreshing: false,
  fetchedAt: null,
  trending: [],
  latest: [],
};

const fromAnkerGames = (game: AnkerGamesFeedGame): FrontPageGame =>
  toFrontPageGame(game, { version: game.version ?? undefined });

const fromChart = (row: CatalogueChartRow): FrontPageGame => ({
  shop: "steam",
  objectId: row.appId,
  title: row.title,
  libraryImageUrl: row.headerImageUrl,
  releaseYear: row.releaseYear,
  rank: row.rank,
});

/** A chart's rows, asked for once and kept a few minutes. */
function useChartRows(chart: CatalogueChartId) {
  const [rows, setRows] = useState(chartCache.get(chart)?.rows ?? null);

  useEffect(() => {
    const cached = chartCache.get(chart);
    if (cached && Date.now() - cached.at < CHART_CACHE_MS) {
      setRows(cached.rows);
      return;
    }

    let current = true;
    const snapshotKey = `discover-chart:${chart}`;
    if (!cached) {
      void readCatalogueSnapshot<CatalogueChartRow[]>(snapshotKey).then(
        (snapshot) => {
          if (current && snapshot) setRows((rows) => rows ?? snapshot.data);
        }
      );
    }
    window.electron
      .getCatalogueChart({ chart })
      .then((result) => {
        if (!result.failed && result.rows.length > 0) {
          chartCache.set(chart, { at: Date.now(), rows: result.rows });
          writeCatalogueSnapshot(snapshotKey, result.rows.slice(0, CANDIDATES));
        }
        if (!current) return;
        setRows((rows) =>
          result.rows.length === 0 && rows?.length ? rows : result.rows
        );
      })
      .catch((error) => {
        logger.error(`Failed to load the ${chart} chart`, error);
        if (current) setRows([]);
      });

    return () => {
      current = false;
    };
  }, [chart]);

  return rows;
}

const fromRecommendation = (
  recommendation: Recommendation,
  reason: Pick<FrontPageGame, "reason" | "reasonTitle">
): FrontPageGame => ({
  ...toCardGame(recommendation),
  releaseYear: recommendation.releaseYear,
  ...reason,
});

function GroupHeading({ children }: Readonly<{ children: ReactNode }>) {
  return <h2 className="catalogue-front-page__group">{children}</h2>;
}

function FrontPageShelf({
  title,
  games,
  isLoading,
  isRefreshing,
  onSeeAll,
  onNotInterested,
  libraryStates,
  facts,
  feedbackFor,
}: Readonly<{
  title: string;
  games: FrontPageGame[];
  isLoading: boolean;
  /** Shows the games already known and says that newer ones are on the way. */
  isRefreshing?: boolean;
  onSeeAll?: () => void;
  /** Leave out for rows that show a site's list whole. */
  onNotInterested?: (game: FrontPageGame) => void;
  libraryStates: Map<string, CatalogueLibraryState>;
  facts: Map<string, StoreGameFacts>;
  /** For suggestions: Not interested asks why, and More like this appears. */
  feedbackFor?: (game: FrontPageGame) => StoreGameFeedback | undefined;
}>) {
  if (!isLoading && games.length === 0) return null;

  return (
    <StoreShelf
      title={title}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      onSeeAll={onSeeAll}
    >
      {games.map((game) => {
        const key = catalogueKey(game);
        let badge: ReactNode = null;
        if (game.version) badge = <StoreGameChip>{game.version}</StoreGameChip>;
        else if (game.rank) badge = <StoreGameChip>#{game.rank}</StoreGameChip>;

        return (
          <StoreGameCard
            key={key}
            size="shelf"
            game={game}
            facts={facts.get(key)}
            libraryState={libraryStates.get(key)}
            reason={game.reason}
            reasonTitle={game.reasonTitle}
            badge={badge}
            onNotInterested={
              onNotInterested ? () => onNotInterested(game) : undefined
            }
            feedback={feedbackFor?.(game)}
          />
        );
      })}
    </StoreShelf>
  );
}

/** One game given room: the cover beside its title, reason, facts and actions. */
function FeaturePanel({
  game,
  eyebrow,
  isHero = false,
  onAdded,
  onNotInterested,
  children,
}: Readonly<{
  game: FrontPageGame;
  eyebrow?: string;
  isHero?: boolean;
  onAdded: () => void;
  onNotInterested: () => void;
  /** Extra buttons, after the usual ones. */
  children?: ReactNode;
}>) {
  const { t } = useTranslation("catalogue");
  const navigate = useNavigate();
  const [isAdding, setIsAdding] = useState(false);
  const facts = useCatalogueRowDetails([game]);
  const gameFacts = facts.get(catalogueKey(game));

  const addToLibrary = async () => {
    setIsAdding(true);
    try {
      await window.electron.addGameToLibrary(
        game.shop,
        game.objectId,
        game.title,
        null
      );
      // Owned games leave the lists, so the next one moves into this place.
      onAdded();
    } catch (error) {
      logger.error("Failed to add game to library", error);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div
      className={
        isHero
          ? "catalogue-front-page__queue catalogue-front-page__queue--hero"
          : "catalogue-front-page__queue"
      }
    >
      <div className="catalogue-front-page__queue-cover">
        <StoreGameCover game={game} previewUrl={null} variant="card" />
      </div>
      <div className="catalogue-front-page__queue-details">
        {eyebrow && (
          <span className="catalogue-front-page__queue-position">
            {eyebrow}
          </span>
        )}
        <h3>
          <Link to={buildGameDetailsPath(game)}>{game.title}</Link>
        </h3>
        {game.reason && <p title={game.reasonTitle}>{game.reason}</p>}
        <StoreGameMeta
          facts={gameFacts}
          pending={!gameFacts}
          releaseYear={game.releaseYear}
        />
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
          <Button theme="outline" onClick={onNotInterested}>
            <XIcon size={16} />
            {t("not_interested")}
          </Button>
          {children}
        </div>
      </div>
    </div>
  );
}

function DiscoveryQueue({
  queue,
  onAdded,
  onNotInterested,
}: Readonly<{
  queue: FrontPageGame[];
  onAdded: () => void;
  onNotInterested: (game: FrontPageGame) => void;
}>) {
  const { t } = useTranslation("catalogue");
  const [position, setPosition] = useState(0);

  useEffect(() => {
    if (position >= queue.length && queue.length > 0) setPosition(0);
  }, [position, queue.length]);

  const current = Math.min(position, queue.length - 1);
  const game = queue[current];
  if (!game) return null;

  return (
    <StoreShelfFrame title={t("discovery_queue")}>
      <FeaturePanel
        key={catalogueKey(game)}
        game={game}
        eyebrow={t("discovery_queue_position", {
          position: current + 1,
          count: queue.length,
        })}
        onAdded={onAdded}
        onNotInterested={() => onNotInterested(game)}
      >
        <Button
          theme="primary"
          onClick={() => setPosition((value) => (value + 1) % queue.length)}
        >
          {t("discovery_queue_next")}
          <ChevronRightIcon size={16} />
        </Button>
      </FeaturePanel>
    </StoreShelfFrame>
  );
}

function StoreShelfFrame({
  title,
  children,
}: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className="catalogue-front-page__shelf">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/**
 * The Discover tab, grouped by purpose: suggestions made for you, what is
 * popular now, what is new (including the AnkerGames rows) and ways to explore.
 */
export function CatalogueFrontPage({
  downloadSources,
  libraryStates,
  hideOwned,
}: Readonly<CatalogueFrontPageProps>) {
  const { t } = useTranslation("catalogue");
  const dispatch = useAppDispatch();
  const { updateLibrary } = useLibrary();
  const tagLabels = useSteamTagLabels();
  const { formatNumber } = useFormat();
  const popularTags = usePopularSteamTags();
  const { counts: facetCounts } = useFacetCounts();
  const tune = useTuneSettings();
  const notInterested = useNotInterested();

  const ownedKeys = useMemo(
    () =>
      new Set(
        [...libraryStates]
          .filter(([, state]) => isOwnedLibraryState(state))
          .map(([key]) => key)
      ),
    [libraryStates]
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
    const snapshotKey = `discover:${sourcesKey}`;
    if (!cached) {
      void readCatalogueSnapshot<{
        featured: FrontPageGame[];
        newReleases: FrontPageGame[];
      }>(snapshotKey).then((snapshot) => {
        if (!current || !snapshot) return;
        setFeatured((games) =>
          games.length > 0 ? games : snapshot.data.featured
        );
        setNewReleases((games) =>
          games.length > 0 ? games : snapshot.data.newReleases
        );
        setIsLoading(false);
      });
    }
    const sources = orderBy(downloadSources, "createdAt", "desc");
    const downloadSourceIds = sources.map((source) => source.id);
    const fingerprints = sources.flatMap((source) =>
      source.fingerprint ? [source.fingerprint] : []
    );

    const loadFeatured = window.electron.hydraApi
      .get<ShopAssets[]>(`/catalogue/${CatalogueCategory.Hot}`, {
        params: { take: CANDIDATES, skip: 0, downloadSourceIds },
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
                take: CANDIDATES,
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
        const found = featuredGames.length > 0 || newGames.length > 0;
        if (found) {
          shelvesCache.set(sourcesKey, {
            at: Date.now(),
            featured: featuredGames,
            newReleases: newGames,
          });
          writeCatalogueSnapshot(snapshotKey, {
            featured: featuredGames,
            newReleases: newGames,
          });
        }
        // A failed refresh keeps what was shown.
        if (!current || !found) return;
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

  // Suggestions, and the two shelves that are the same suggestions seen through
  // a filter. They share what Hydra fetched, so only the re-ranking differs.
  // Discover always shows the library's groups mixed; For you keeps its own choice.
  const options = useMemo<TuneOptions | null>(
    () =>
      tune.isLoaded
        ? { ...tune.options, basedOn: "groups", group: "all" }
        : null,
    [tune.isLoaded, tune.options]
  );
  const gemsOptions = useMemo<TuneOptions | null>(
    () =>
      options && {
        ...options,
        minReviewPercent: 90,
        minReviews: 50,
        maxReviews: 5000,
        popularity: -1,
      },
    [options]
  );
  const polishedOptions = useMemo<TuneOptions | null>(
    () => options && { ...options, finishedOnly: true, minReviewPercent: 85 },
    [options]
  );
  const forYou = useRecommendations(options, { debounce: false });
  const gems = useRecommendations(gemsOptions, { debounce: false });
  const polished = useRecommendations(polishedOptions, { debounce: false });

  const groups = useMemo(
    () => forYou.response?.profile.groups ?? [],
    [forYou.response]
  );
  const groupOptions = (index: number) =>
    options && groups[index] ? { ...options, group: groups[index].id } : null;
  const firstGroup = useRecommendations(
    useMemo(() => groupOptions(0), [options, groups]), // eslint-disable-line react-hooks/exhaustive-deps
    { debounce: false }
  );
  const secondGroup = useRecommendations(
    useMemo(() => groupOptions(1), [options, groups]), // eslint-disable-line react-hooks/exhaustive-deps
    { debounce: false }
  );
  const thirdGroup = useRecommendations(
    useMemo(() => groupOptions(2), [options, groups]), // eslint-disable-line react-hooks/exhaustive-deps
    { debounce: false }
  );
  const groupLists = [firstGroup, secondGroup, thirdGroup].slice(
    0,
    Math.min(GROUP_SHELVES, groups.length)
  );

  // Outside your usual: the catalogue's most common tags that none of your groups is about.
  const outsideOptions = useMemo<TuneOptions | null>(() => {
    if (!options || !facetCounts || groups.length === 0) return null;
    const yours = new Set([
      ...groups.flatMap((group) => group.tagIds),
      ...(forYou.response?.profile.tags ?? []).map((tag) => tag.tagId),
    ]);
    const seedTags = Object.entries(facetCounts.tags)
      .map(([id, count]) => ({ id: Number(id), count }))
      .filter((tag) => !FEATURE_TAG_IDS.has(tag.id))
      .sort((a, b) => b.count - a.count)
      .slice(0, OUTSIDE_COMMON_TAGS)
      .filter((tag) => !yours.has(tag.id))
      .slice(0, OUTSIDE_TAGS)
      .map((tag) => tag.id);
    return seedTags.length > 0
      ? { ...options, basedOn: "tags", seedTags, minReviewPercent: 85 }
      : null;
  }, [options, facetCounts, groups, forYou.response]);
  const outside = useRecommendations(outsideOptions, { debounce: false });

  const chartMostPlayed = useChartRows("most-played");
  const chartTrending = useChartRows("trending");
  const chartAnticipated = useChartRows("most-anticipated");

  const playedElsewhere = tune.settings.playedElsewhere;
  const isShown = (game: FrontPageGame) => {
    const key = catalogueKey(game);
    return (
      !notInterested.keys.has(key) &&
      !ownedKeys.has(key) &&
      !(game.shop === "steam" && playedElsewhere?.[game.objectId])
    );
  };

  const recommendations = useMemo(
    () =>
      (forYou.response?.results ?? []).filter((recommendation) =>
        isShown(toCardGame(recommendation))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [forYou.response, notInterested.keys, ownedKeys, playedElsewhere]
  );
  const groupNames = new Map(
    groups.map((group) => [group.id, getGroupName(group, tagLabels)])
  );
  const describeGroup = (groupId: string) => {
    const name = groupNames.get(groupId);
    return name ? t("fits_group", { name }) : undefined;
  };
  const toRecommendationGames = (list: Recommendation[]) =>
    list
      .filter((recommendation) => isShown(toCardGame(recommendation)))
      .map((recommendation) =>
        fromRecommendation(
          recommendation,
          getRecommendationReason(recommendation, tagLabels, describeGroup)
        )
      );

  const [hero, ...rest] = toRecommendationGames(recommendations);
  const queueFromYou = rest.slice(SHELF_SIZE);
  const groupShelves = groupLists.map((list, index) => ({
    group: groups[index],
    isLoading: !list.response && list.isRefreshing,
    isRefreshing: list.isRefreshing && !!list.response,
    // The shelf's title already names the group's tags.
    games: toRecommendationGames(list.response?.results ?? [])
      .filter((game) => game.objectId !== hero?.objectId)
      .slice(0, SHELF_SIZE)
      .map((game) => ({ ...game, reason: undefined })),
  }));
  const outsideGames = toRecommendationGames(
    outside.response?.results ?? []
  ).slice(0, SHELF_SIZE);
  useRecordImpressions([
    ...(hero ? [hero.objectId] : []),
    ...groupShelves.flatMap((shelf) =>
      shelf.games.map((game) => game.objectId)
    ),
  ]);
  const gemsGames = toRecommendationGames(gems.response?.results ?? []).slice(
    0,
    SHELF_SIZE
  );
  const polishedGames = toRecommendationGames(
    polished.response?.results ?? []
  ).slice(0, SHELF_SIZE);

  const hasNoLibrary =
    !!forYou.response &&
    !forYou.response.failed &&
    forYou.response.profile.groups.length === 0;

  const { filter: hideAvoided, isAvoided } = useAvoidFilter([
    ...featured,
    ...newReleases,
  ]);
  const shelfGames = (games: FrontPageGame[]) =>
    hideAvoided(
      games.filter((game) => !notInterested.keys.has(catalogueKey(game)))
    )
      .filter((game) => !hideOwned || !ownedKeys.has(catalogueKey(game)))
      .slice(0, SHELF_SIZE);

  const chartGames = (rows: CatalogueChartRow[] | null) =>
    shelfGames(
      (rows ?? [])
        .slice(0, CANDIDATES)
        .filter((row) => !isAvoided(row.tagIds))
        .map(fromChart)
    );

  const hide = (game: FrontPageGame) =>
    notInterested.markNotInterested({
      shop: game.shop,
      objectId: game.objectId,
      title: game.title,
    });

  const openForYou = () => dispatch(setDiscoverView("for-you"));
  const openGroup = (groupId: string) => {
    tune.setOptions({ basedOn: "groups", group: groupId });
    openForYou();
  };
  const openForYouWith = (changes: Partial<TuneOptions>) => {
    tune.setOptions(changes);
    openForYou();
  };
  const openChart = (chart: CatalogueChartId) => {
    try {
      localStorage.setItem(CHART_STORAGE_KEY, JSON.stringify(chart));
    } catch {
      /* not persisted */
    }
    dispatch(setCatalogueTab("charts"));
  };

  const seeAllNewReleases = () => {
    dispatch(
      setFilters({
        sortBy: "releaseDate",
        sortOrder: "desc",
        downloadSourceFingerprints: downloadSources.flatMap((source) =>
          source.fingerprint ? [source.fingerprint] : []
        ),
      })
    );
  };

  // The site's rows as they are: games you own stay, and nothing is cut.
  const ankerGamesRow = (games: AnkerGamesFeedGame[] = []) =>
    games.map(fromAnkerGames);
  const ankerGamesLoading = (games: AnkerGamesFeedGame[] = []) =>
    ankerGames === null || (ankerGames.refreshing && games.length === 0);

  const queue = useMemo(() => {
    const seen = new Set<string>();
    const games: FrontPageGame[] = [];
    const trending = (chartTrending ?? []).map(fromChart);
    for (const game of [
      ...queueFromYou,
      ...trending,
      ...newReleases,
      ...featured,
    ]) {
      const key = catalogueKey(game);
      if (seen.has(key) || ownedKeys.has(key) || notInterested.keys.has(key)) {
        continue;
      }
      seen.add(key);
      games.push(game);
    }
    return games;
    // queueFromYou is rebuilt every render; its source is forYou.response.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    forYou.response,
    chartTrending,
    newReleases,
    featured,
    ownedKeys,
    notInterested.keys,
  ]);

  const tags = useMemo(() => {
    return popularTags.tags
      .filter(
        (tag) => !FEATURE_TAG_IDS.has(tag.id) && !popularTags.empty.has(tag.id)
      )
      .slice(0, SHELF_TAGS)
      .map((tag) => ({
        id: tag.id,
        label: tagLabels.get(tag.id) ?? tag.name,
        count: facetCounts?.tags[tag.id] ?? null,
      }));
  }, [popularTags, tagLabels, facetCounts]);

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
              {tag.count !== null && (
                <span className="catalogue-front-page__tag-count">
                  {formatNumber(tag.count)}
                </span>
              )}
            </button>
          ))}
        </div>
      </section>
    );
  }

  const mostPlayedGames = chartGames(chartMostPlayed);
  const trendingGames = chartGames(chartTrending);
  const featuredGames = shelfGames(featured);
  const latestGames = ankerGamesRow(ankerGames?.latest);
  const ankerTrendingGames = ankerGamesRow(ankerGames?.trending);
  const newGames = shelfGames(newReleases);
  const anticipatedGames = chartGames(chartAnticipated);

  const facts = useCatalogueRowDetails([
    ...(hero ? [hero] : []),
    ...groupShelves.flatMap((shelf) => shelf.games),
    ...anticipatedGames,
    ...outsideGames,
    ...mostPlayedGames,
    ...trendingGames,
    ...featuredGames,
    ...latestGames,
    ...ankerTrendingGames,
    ...newGames,
    ...gemsGames,
    ...polishedGames,
  ]);

  const suggestion = useSuggestionFeedback(facts);
  const shelfProps = { libraryStates, facts };
  const suggestionProps = {
    ...shelfProps,
    feedbackFor: suggestion.feedbackFor,
  };
  const isLoadingForYou = !forYou.response && forYou.isRefreshing;

  let forYouGroup: ReactNode;
  if (hasNoLibrary) {
    forYouGroup = (
      <div className="catalogue-front-page__explain">
        <p>{t("for_you_no_library")}</p>
        <Link to="/library">{t("for_you_open_library")}</Link>
      </div>
    );
  } else if (forYou.response?.failed && recommendations.length === 0) {
    forYouGroup = (
      <div className="catalogue-front-page__explain">
        <p>{t("for_you_failed")}</p>
        <Button theme="outline" onClick={forYou.retry}>
          {t("chart_retry")}
        </Button>
      </div>
    );
  } else {
    const gameCount = groups.reduce(
      (sum, group) => sum + group.games.length,
      0
    );
    forYouGroup = (
      <>
        <section className="catalogue-front-page__recommender">
          <div className="catalogue-front-page__recommender-text">
            <h2>{t("recommended_for_you")}</h2>
            <p>
              {groups.length > 0
                ? t("recommender_summary", {
                    count: gameCount,
                    formattedCount: formatNumber(gameCount),
                    groups: groups.length,
                  })
                : t("recommender_loading")}
            </p>
            {groups.length > 0 && (
              <ul className="catalogue-front-page__group-chips">
                {groups.map((group) => (
                  <li key={group.id}>
                    <button
                      type="button"
                      className="catalogue-front-page__group-chip"
                      onClick={() => openGroup(group.id)}
                    >
                      {groupNames.get(group.id)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button theme="primary" onClick={openForYou}>
            {t("open_recommendations")}
            <ChevronRightIcon size={16} />
          </Button>
        </section>
        {hero && (
          <FeaturePanel
            key={catalogueKey(hero)}
            isHero
            game={hero}
            eyebrow={t("top_pick")}
            onAdded={updateLibrary}
            onNotInterested={() => hide(hero)}
          />
        )}
        {isLoadingForYou && (
          <FrontPageShelf
            title={t("recommended_for_you")}
            games={[]}
            isLoading
            {...shelfProps}
          />
        )}
        {groupShelves.map((shelf) => (
          <FrontPageShelf
            key={shelf.group.id}
            title={groupNames.get(shelf.group.id) ?? t("recommended_for_you")}
            games={shelf.games}
            isLoading={shelf.isLoading}
            isRefreshing={shelf.isRefreshing}
            onSeeAll={() => openGroup(shelf.group.id)}
            onNotInterested={hide}
            {...suggestionProps}
          />
        ))}
      </>
    );
  }

  return (
    <div className="catalogue-front-page">
      {suggestion.dialog}
      <GroupHeading>{t("group_for_you")}</GroupHeading>
      {forYouGroup}

      <GroupHeading>{t("group_popular")}</GroupHeading>
      <FrontPageShelf
        title={t("chart_most-played")}
        games={mostPlayedGames}
        isLoading={chartMostPlayed === null}
        onSeeAll={() => openChart("most-played")}
        onNotInterested={hide}
        {...shelfProps}
      />
      <FrontPageShelf
        title={t("chart_trending")}
        games={trendingGames}
        isLoading={chartTrending === null}
        onSeeAll={() => openChart("trending")}
        onNotInterested={hide}
        {...shelfProps}
      />
      <FrontPageShelf
        title={t("featured")}
        games={featuredGames}
        isLoading={isLoading}
        onNotInterested={hide}
        {...shelfProps}
      />

      <GroupHeading>{t("group_new")}</GroupHeading>
      <FrontPageShelf
        title={t("new_releases")}
        games={newGames}
        isLoading={isLoading}
        onSeeAll={seeAllNewReleases}
        onNotInterested={hide}
        {...shelfProps}
      />
      <FrontPageShelf
        title={t("chart_most-anticipated")}
        games={anticipatedGames}
        isLoading={chartAnticipated === null}
        onSeeAll={() => openChart("most-anticipated")}
        onNotInterested={hide}
        {...shelfProps}
      />
      <FrontPageShelf
        title={t("ankergames_new")}
        games={latestGames}
        isLoading={ankerGamesLoading(ankerGames?.latest)}
        isRefreshing={ankerGames?.refreshing}
        {...shelfProps}
      />
      <FrontPageShelf
        title={t("ankergames_trending")}
        games={ankerTrendingGames}
        isLoading={ankerGamesLoading(ankerGames?.trending)}
        isRefreshing={ankerGames?.refreshing}
        {...shelfProps}
      />

      <GroupHeading>{t("group_explore")}</GroupHeading>
      {!hasNoLibrary && (
        <>
          <FrontPageShelf
            title={t("hidden_gems")}
            games={gemsGames}
            isLoading={!gems.response && gems.isRefreshing}
            onSeeAll={() =>
              openForYouWith({
                minReviewPercent: 90,
                minReviews: 50,
                maxReviews: 5000,
                popularity: -1,
              })
            }
            onNotInterested={hide}
            {...suggestionProps}
          />
          <FrontPageShelf
            title={t("finished_polished")}
            games={polishedGames}
            isLoading={!polished.response && polished.isRefreshing}
            onSeeAll={() =>
              openForYouWith({ finishedOnly: true, minReviewPercent: 85 })
            }
            onNotInterested={hide}
            {...suggestionProps}
          />
          {outsideOptions && (
            <FrontPageShelf
              title={t("outside_your_usual")}
              games={outsideGames}
              isLoading={!outside.response && outside.isRefreshing}
              onSeeAll={() =>
                openForYouWith({
                  basedOn: "tags",
                  seedTags: outsideOptions.seedTags,
                  minReviewPercent: 85,
                })
              }
              onNotInterested={hide}
              {...suggestionProps}
            />
          )}
        </>
      )}
      <DiscoveryQueue
        queue={queue}
        onAdded={updateLibrary}
        onNotInterested={hide}
      />
      {tagList}
    </div>
  );
}
