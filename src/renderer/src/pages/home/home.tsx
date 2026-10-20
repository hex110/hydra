import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { levelDBService } from "@renderer/services/leveldb.service";
import { orderBy } from "lodash-es";
import { useNavigate } from "react-router-dom";

import Skeleton, { SkeletonTheme } from "react-loading-skeleton";

import {
  Avatar,
  Button,
  GameCard,
  GameContextMenu,
  Hero,
  VerticalCoverCard,
} from "@renderer/components";
import type {
  DownloadSource,
  LibraryGame,
  ShopAssets,
  Steam250Game,
} from "@types";
import {
  useActiveGameSetups,
  useAppSelector,
  useLibrary,
} from "@renderer/hooks";
import { useCollectionContextMenu } from "@renderer/context";
import { LibraryGameCard } from "@renderer/pages/library/library-game-card";
import { getLibraryGameActivity } from "@renderer/pages/library/library-game-activity";

import flameIconStatic from "@renderer/assets/icons/flame-static.png";
import flameIconAnimated from "@renderer/assets/icons/flame-animated.gif";
import starsIconAnimated from "@renderer/assets/icons/stars-animated.gif";

import {
  buildGameDetailsPath,
  ensureArray,
  isGameInstalled,
} from "@renderer/helpers";
import {
  CatalogueCategory,
  formatReleaseVersion,
  groupLibraryGames,
  parseReleaseVersion,
} from "@shared";
import { GearIcon } from "@primer/octicons-react";
import { HomeShelf } from "./home-shelf";
import { LastPlayedHero } from "./last-played-hero";
import { PlayActivityPanel } from "./play-activity-panel";
import { GameNewsCard } from "./game-news-card";
import { HomeCustomiseModal } from "./home-customise-modal";
import {
  gameKey,
  getAlmostDone,
  getBacklog,
  getCompletionProgress,
  getContinuePlaying,
  getNewDownloadOptionsCount,
  getRecentlyAdded,
  getWishlist,
} from "./home-sections";
import {
  HOME_SHELVES_STORAGE_KEY,
  parseHomeShelfLayout,
  type HomeShelfId,
  type HomeShelfLayout,
} from "./home-shelves";
import { usePlayActivity } from "./use-play-activity";
import { useHomeSuggestions } from "./use-home-suggestions";
import { useGameNews } from "./use-game-news";
import { useFriendsPlaying } from "./use-friends-playing";
import "./home.scss";

const NEWS_GAMES = 8;
const NEWS_ITEMS = 8;
const NEWS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const describeRelease = (title: string) =>
  formatReleaseVersion(parseReleaseVersion(title)) ?? title;

const readShelfLayout = (): HomeShelfLayout => {
  try {
    return parseHomeShelfLayout(localStorage.getItem(HOME_SHELVES_STORAGE_KEY));
  } catch {
    return parseHomeShelfLayout(null);
  }
};

/** The Steam app a library game is known by in the catalogue, if any. */
const steamAppIdOf = (game: LibraryGame) => {
  const identity = game.catalogueGame ?? game;
  return identity.shop === "steam" ? identity.objectId : null;
};

export default function Home() {
  const { t } = useTranslation("home");
  const navigate = useNavigate();

  const { library } = useLibrary();
  const runningGameId = useAppSelector(
    (state) => state.gameRunning.gameRunning?.id
  );
  const activeDownloadId = useAppSelector(
    (state) => state.download.lastPacket?.gameId ?? null
  );
  const extractionId = useAppSelector(
    (state) => state.download.extraction?.visibleId ?? null
  );
  const setupGameIds = useActiveGameSetups();
  const { openCollectionContextMenu } = useCollectionContextMenu();
  const [gameContextMenu, setGameContextMenu] = useState<{
    game: LibraryGame | null;
    visible: boolean;
    position: { x: number; y: number };
  }>({ game: null, visible: false, position: { x: 0, y: 0 } });
  const [shelfLayout, setShelfLayout] = useState(readShelfLayout);
  const [showCustomise, setShowCustomise] = useState(false);

  const handleShelfLayoutChange = useCallback((next: HomeShelfLayout) => {
    setShelfLayout(next);
    try {
      localStorage.setItem(HOME_SHELVES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Not remembered; the layout still applies until Hydra restarts.
    }
  }, []);

  const groupedLibrary = useMemo(
    () => groupLibraryGames(library, runningGameId ? [runningGameId] : []),
    [library, runningGameId]
  );
  const { entries: playActivity, recentPlayByKey } = usePlayActivity();
  const continuePlaying = useMemo(
    () => getContinuePlaying(groupedLibrary),
    [groupedLibrary]
  );
  const [lastPlayed, ...otherRecentGames] = continuePlaying;
  const continueKeys = useMemo(
    () => new Set(continuePlaying.map(gameKey)),
    [continuePlaying]
  );
  const backlog = useMemo(
    () => getBacklog(groupedLibrary, isGameInstalled, continueKeys),
    [groupedLibrary, continueKeys]
  );
  const recentlyAdded = useMemo(
    () => getRecentlyAdded(groupedLibrary, continueKeys),
    [groupedLibrary, continueKeys]
  );
  const almostDone = useMemo(
    () => getAlmostDone(groupedLibrary, continueKeys),
    [groupedLibrary, continueKeys]
  );
  const wishlist = useMemo(
    () => getWishlist(groupedLibrary, isGameInstalled),
    [groupedLibrary]
  );
  const updates = useMemo(
    () =>
      groupedLibrary
        .filter((game) => game.availableUpdate && game.executablePath)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [groupedLibrary]
  );
  const downloads = useMemo(
    () =>
      groupedLibrary.filter(
        (game) =>
          getLibraryGameActivity(game, {
            activeDownload: activeDownloadId
              ? { gameId: activeDownloadId, progress: 0 }
              : null,
            extraction: extractionId
              ? { gameId: extractionId, progress: 0 }
              : null,
            setupGameIds,
          }) !== null
      ),
    [groupedLibrary, activeDownloadId, extractionId, setupGameIds]
  );

  const { suggestions, isLoading: isLoadingSuggestions } = useHomeSuggestions(
    groupedLibrary,
    recentPlayByKey
  );

  // News for what you play: recent games first, then the most played.
  const newsGames = useMemo(() => {
    const byAppId = new Map<string, LibraryGame>();
    const candidates = [
      ...continuePlaying,
      ...orderBy(groupedLibrary, (game) => game.playTimeInMilliseconds, "desc"),
    ];
    for (const game of candidates) {
      const appId = steamAppIdOf(game);
      if (appId && !byAppId.has(appId)) byAppId.set(appId, game);
      if (byAppId.size >= NEWS_GAMES) break;
    }
    return byAppId;
  }, [continuePlaying, groupedLibrary]);
  const newsAppIds = useMemo(() => [...newsGames.keys()], [newsGames]);
  const showNews = !shelfLayout.hidden.includes("news");
  const { news, isLoading: isLoadingNews } = useGameNews(
    showNews ? newsAppIds : [],
    2
  );
  const recentNews = useMemo(
    () =>
      news
        .filter(
          (item) => Date.now() - new Date(item.date).getTime() < NEWS_MAX_AGE_MS
        )
        .slice(0, NEWS_ITEMS),
    [news]
  );

  const friendsPlaying = useFriendsPlaying();

  const openContextMenu = useCallback(
    (game: LibraryGame, position: { x: number; y: number }) =>
      setGameContextMenu({ game, visible: true, position }),
    []
  );

  const [animateFlame, setAnimateFlame] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [randomGame, setRandomGame] = useState<Steam250Game | null>(null);

  const [currentCatalogueCategory, setCurrentCatalogueCategory] = useState(
    CatalogueCategory.Hot
  );

  const [catalogue, setCatalogue] = useState<
    Record<CatalogueCategory, ShopAssets[]>
  >({
    [CatalogueCategory.Hot]: [],
    [CatalogueCategory.Weekly]: [],
    [CatalogueCategory.Achievements]: [],
  });

  const getCatalogue = useCallback(async (category: CatalogueCategory) => {
    try {
      setCurrentCatalogueCategory(category);
      setIsLoading(true);

      const sources = (await levelDBService.values(
        "downloadSources"
      )) as DownloadSource[];
      const downloadSources = orderBy(sources, "createdAt", "desc");

      const params = {
        take: 12,
        skip: 0,
        downloadSourceIds: downloadSources.map((source) => source.id),
      };

      const catalogue = await window.electron.hydraApi.get<ShopAssets[]>(
        `/catalogue/${category}`,
        {
          params,
          needsAuth: false,
        }
      );

      setCatalogue((prev) => ({
        ...prev,
        [category]: ensureArray<ShopAssets>(
          catalogue,
          `/catalogue/${category}`
        ),
      }));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getRandomGame = useCallback(() => {
    window.electron.getRandomGame().then((game) => {
      if (game) setRandomGame(game);
    });
  }, []);

  const handleRandomizerClick = () => {
    if (randomGame) {
      navigate(
        buildGameDetailsPath(
          { ...randomGame, shop: "steam" },
          {
            fromRandomizer: "1",
          }
        )
      );
    }
  };

  const handleCategoryClick = (category: CatalogueCategory) => {
    if (category !== currentCatalogueCategory) {
      getCatalogue(category);
    }
  };

  const showCatalogue = !shelfLayout.hidden.includes("catalogue");

  useEffect(() => {
    if (!showCatalogue) return;
    setIsLoading(true);
    getCatalogue(CatalogueCategory.Hot);

    getRandomGame();
  }, [getCatalogue, getRandomGame, showCatalogue]);

  const categories = Object.values(CatalogueCategory);

  const handleMouseEnterCategory = (category: CatalogueCategory) => {
    if (category === CatalogueCategory.Hot) {
      setAnimateFlame(true);
    }
  };

  const handleMouseLeaveCategory = (category: CatalogueCategory) => {
    if (category === CatalogueCategory.Hot) {
      setAnimateFlame(false);
    }
  };

  const renderCards = (games: LibraryGame[]) =>
    games.map((game) => (
      <LibraryGameCard
        key={game.id}
        game={game}
        onContextMenu={openContextMenu}
      />
    ));

  const renderCaptionedCards = (
    games: LibraryGame[],
    caption: (game: LibraryGame) => React.ReactNode
  ) =>
    games.map((game) => (
      <div key={game.id} className="home__suggestion">
        <LibraryGameCard game={game} onContextMenu={openContextMenu} />
        {caption(game)}
      </div>
    ));

  const renderShelf = (id: HomeShelfId): React.ReactNode => {
    switch (id) {
      case "activity":
        return groupedLibrary.length > 0 ? (
          <div className="home__activity">
            <PlayActivityPanel entries={playActivity} library={library} />
          </div>
        ) : null;

      case "continue_playing":
        return otherRecentGames.length > 0 ? (
          <HomeShelf title={t("continue_playing")}>
            {renderCards(otherRecentGames)}
          </HomeShelf>
        ) : null;

      case "downloads":
        return downloads.length > 0 ? (
          <HomeShelf
            title={t("shelf_downloads")}
            action={
              <button
                type="button"
                className="home__shelf-link"
                onClick={() => navigate("/downloads")}
              >
                {t("see_downloads")}
              </button>
            }
          >
            {renderCards(downloads)}
          </HomeShelf>
        ) : null;

      case "updates":
        return updates.length > 0 ? (
          <HomeShelf
            title={t("shelf_updates")}
            description={t("updates_description")}
          >
            {renderCaptionedCards(updates, (game) => {
              const release = game.availableUpdate!.release;
              return (
                <button
                  type="button"
                  className="home__caption-button"
                  title={release.title}
                  onClick={() =>
                    navigate(buildGameDetailsPath(game, { update: "1" }))
                  }
                >
                  {t("update_to", { version: describeRelease(release.title) })}
                </button>
              );
            })}
          </HomeShelf>
        ) : null;

      case "recently_added":
        return recentlyAdded.length > 0 ? (
          <HomeShelf
            title={t("shelf_recently_added")}
            description={t("recently_added_description")}
          >
            {renderCards(recentlyAdded)}
          </HomeShelf>
        ) : null;

      case "almost_done":
        return almostDone.length > 0 ? (
          <HomeShelf
            title={t("shelf_almost_done")}
            description={t("almost_done_description")}
          >
            {renderCaptionedCards(almostDone, (game) => (
              <p className="home__suggestion-reason">
                {t("percent_done", {
                  percent: Math.round((getCompletionProgress(game) ?? 0) * 100),
                })}
              </p>
            ))}
          </HomeShelf>
        ) : null;

      case "backlog":
        return backlog.length > 0 ? (
          <HomeShelf
            title={t("clear_your_backlog")}
            description={t("clear_your_backlog_description")}
          >
            {renderCards(backlog)}
          </HomeShelf>
        ) : null;

      case "wishlist":
        return wishlist.length > 0 ? (
          <HomeShelf
            title={t("shelf_wishlist")}
            description={t("wishlist_description")}
            action={
              <button
                type="button"
                className="home__shelf-link"
                onClick={() => navigate("/library?collection=__wishlist__")}
              >
                {t("see_all")}
              </button>
            }
          >
            {renderCaptionedCards(wishlist, (game) => {
              const count = getNewDownloadOptionsCount(game);
              return (
                <p
                  className={`home__suggestion-reason${count > 0 ? " home__suggestion-reason--highlight" : ""}`}
                >
                  {count > 0
                    ? t("new_downloads", { count })
                    : t("waiting_for_download")}
                </p>
              );
            })}
          </HomeShelf>
        ) : null;

      case "friends":
        return friendsPlaying.length > 0 ? (
          <HomeShelf title={t("shelf_friends")}>
            {friendsPlaying.map((friend) => (
              <div key={friend.id} className="home__suggestion">
                <VerticalCoverCard
                  gameTitle={friend.currentGame.title}
                  coverImageUrls={[
                    friend.currentGame.coverImageUrl,
                    friend.currentGame.libraryImageUrl,
                    friend.currentGame.iconUrl,
                  ]}
                  onClick={() =>
                    navigate(buildGameDetailsPath(friend.currentGame))
                  }
                />
                <button
                  type="button"
                  className="home__friend"
                  onClick={() => navigate(`/profile/${friend.id}`)}
                  title={friend.displayName}
                >
                  <Avatar
                    size={20}
                    src={friend.profileImageUrl}
                    alt={friend.displayName}
                  />
                  <span>{friend.displayName}</span>
                </button>
              </div>
            ))}
          </HomeShelf>
        ) : null;

      case "news":
        return isLoadingNews || recentNews.length > 0 ? (
          <HomeShelf title={t("shelf_news")} wide>
            {isLoadingNews
              ? Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="home__news-skeleton" />
                ))
              : recentNews.map((item) => {
                  const game = newsGames.get(item.appId);
                  return (
                    <GameNewsCard
                      key={item.id}
                      item={item}
                      gameTitle={game?.title}
                      fallbackImageUrl={
                        game?.customHeroImageUrl ??
                        game?.libraryHeroImageUrl ??
                        null
                      }
                    />
                  );
                })}
          </HomeShelf>
        ) : null;

      case "suggestions":
        return isLoadingSuggestions || suggestions.length > 0 ? (
          <HomeShelf
            title={t("suggested_for_you")}
            description={t("suggested_for_you_description")}
          >
            {isLoadingSuggestions
              ? Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="home__shelf-skeleton" />
                ))
              : suggestions.map(({ game, becauseOf }) => (
                  <div
                    key={`${game.shop}:${game.objectId}`}
                    className="home__suggestion"
                  >
                    <VerticalCoverCard
                      gameTitle={game.title}
                      coverImageUrls={[
                        game.coverImageUrl,
                        game.libraryImageUrl,
                        game.iconUrl,
                      ]}
                      onClick={() => navigate(buildGameDetailsPath(game))}
                    />
                    <p className="home__suggestion-reason" title={becauseOf}>
                      {t("because_you_played", { title: becauseOf })}
                    </p>
                  </div>
                ))}
          </HomeShelf>
        ) : null;

      case "catalogue":
        return (
          <>
            <section className="home__header">
              <ul className="home__buttons-list">
                {categories.map((category) => (
                  <li key={category}>
                    <Button
                      theme={
                        category === currentCatalogueCategory
                          ? "primary"
                          : "outline"
                      }
                      onClick={() => handleCategoryClick(category)}
                      onMouseEnter={() => handleMouseEnterCategory(category)}
                      onMouseLeave={() => handleMouseLeaveCategory(category)}
                    >
                      {category === CatalogueCategory.Hot && (
                        <div className="home__icon-wrapper">
                          <img
                            src={flameIconStatic}
                            alt=""
                            className="home__flame-icon"
                            style={{ display: animateFlame ? "none" : "block" }}
                          />
                          <img
                            src={flameIconAnimated}
                            alt=""
                            className="home__flame-icon"
                            style={{ display: animateFlame ? "block" : "none" }}
                          />
                        </div>
                      )}

                      {t(category)}
                    </Button>
                  </li>
                ))}
              </ul>

              <Button
                onClick={handleRandomizerClick}
                theme="outline"
                disabled={!randomGame}
              >
                <div className="home__icon-wrapper">
                  <img
                    src={starsIconAnimated}
                    alt=""
                    className="home__stars-icon"
                  />
                </div>
                {t("surprise_me")}
              </Button>
            </section>

            <h2 className="home__title">
              {currentCatalogueCategory === CatalogueCategory.Hot && (
                <div className="home__title-icon">
                  <img
                    src={flameIconAnimated}
                    alt=""
                    className="home__title-flame-icon"
                  />
                </div>
              )}

              {t(currentCatalogueCategory)}
            </h2>

            <section className="home__cards">
              {isLoading
                ? Array.from({ length: 12 }).map((_, index) => (
                    <Skeleton key={index} className="home__card-skeleton" />
                  ))
                : catalogue[currentCatalogueCategory].map((result) => (
                    <GameCard
                      key={result.objectId}
                      game={result}
                      onClick={() => navigate(buildGameDetailsPath(result))}
                    />
                  ))}
            </section>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <SkeletonTheme baseColor="#1c1c1c" highlightColor="#444">
      <section className="home__content">
        {lastPlayed ? <LastPlayedHero game={lastPlayed} /> : <Hero />}

        {shelfLayout.order
          .filter((id) => !shelfLayout.hidden.includes(id))
          .map((id) => {
            const shelf = renderShelf(id);
            return shelf ? <Fragment key={id}>{shelf}</Fragment> : null;
          })}

        <div className="home__footer">
          <Button theme="outline" onClick={() => setShowCustomise(true)}>
            <GearIcon />
            {t("customise_home")}
          </Button>
        </div>

        <HomeCustomiseModal
          visible={showCustomise}
          layout={shelfLayout}
          onChange={handleShelfLayoutChange}
          onClose={() => setShowCustomise(false)}
        />

        {gameContextMenu.game && (
          <GameContextMenu
            game={gameContextMenu.game}
            visible={gameContextMenu.visible}
            position={gameContextMenu.position}
            onClose={() =>
              setGameContextMenu((previous) => ({
                ...previous,
                visible: false,
              }))
            }
            onCollectionContextMenu={openCollectionContextMenu}
          />
        )}
      </section>
    </SkeletonTheme>
  );
}
