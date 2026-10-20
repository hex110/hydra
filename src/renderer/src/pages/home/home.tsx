import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { levelDBService } from "@renderer/services/leveldb.service";
import { orderBy } from "lodash-es";
import { useNavigate } from "react-router-dom";

import Skeleton, { SkeletonTheme } from "react-loading-skeleton";

import {
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
import { useAppSelector, useLibrary } from "@renderer/hooks";
import { useCollectionContextMenu } from "@renderer/context";
import { LibraryGameCard } from "@renderer/pages/library/library-game-card";

import flameIconStatic from "@renderer/assets/icons/flame-static.png";
import flameIconAnimated from "@renderer/assets/icons/flame-animated.gif";
import starsIconAnimated from "@renderer/assets/icons/stars-animated.gif";

import {
  buildGameDetailsPath,
  ensureArray,
  isGameInstalled,
} from "@renderer/helpers";
import { CatalogueCategory, groupLibraryGames } from "@shared";
import { HomeShelf } from "./home-shelf";
import { LastPlayedHero } from "./last-played-hero";
import { PlayActivityPanel } from "./play-activity-panel";
import { getBacklog, getContinuePlaying, gameKey } from "./home-sections";
import { usePlayActivity } from "./use-play-activity";
import { useHomeSuggestions } from "./use-home-suggestions";
import "./home.scss";

export default function Home() {
  const { t } = useTranslation("home");
  const navigate = useNavigate();

  const { library } = useLibrary();
  const runningGameId = useAppSelector(
    (state) => state.gameRunning.gameRunning?.id
  );
  const { openCollectionContextMenu } = useCollectionContextMenu();
  const [gameContextMenu, setGameContextMenu] = useState<{
    game: LibraryGame | null;
    visible: boolean;
    position: { x: number; y: number };
  }>({ game: null, visible: false, position: { x: 0, y: 0 } });

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
  const backlog = useMemo(
    () =>
      getBacklog(
        groupedLibrary,
        isGameInstalled,
        new Set(continuePlaying.map(gameKey))
      ),
    [groupedLibrary, continuePlaying]
  );
  const { suggestions, isLoading: isLoadingSuggestions } = useHomeSuggestions(
    groupedLibrary,
    recentPlayByKey
  );

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

  useEffect(() => {
    setIsLoading(true);
    getCatalogue(CatalogueCategory.Hot);

    getRandomGame();
  }, [getCatalogue, getRandomGame]);

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

  return (
    <SkeletonTheme baseColor="#1c1c1c" highlightColor="#444">
      <section className="home__content">
        {lastPlayed ? <LastPlayedHero game={lastPlayed} /> : <Hero />}

        {groupedLibrary.length > 0 && (
          <div className="home__activity">
            <PlayActivityPanel entries={playActivity} library={library} />
          </div>
        )}

        {otherRecentGames.length > 0 && (
          <HomeShelf title={t("continue_playing")}>
            {otherRecentGames.map((game) => (
              <LibraryGameCard
                key={game.id}
                game={game}
                onContextMenu={openContextMenu}
              />
            ))}
          </HomeShelf>
        )}

        {backlog.length > 0 && (
          <HomeShelf
            title={t("clear_your_backlog")}
            description={t("clear_your_backlog_description")}
          >
            {backlog.map((game) => (
              <LibraryGameCard
                key={game.id}
                game={game}
                onContextMenu={openContextMenu}
              />
            ))}
          </HomeShelf>
        )}

        {(isLoadingSuggestions || suggestions.length > 0) && (
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
        )}

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
