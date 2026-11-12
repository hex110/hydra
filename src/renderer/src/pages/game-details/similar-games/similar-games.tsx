import { ChevronLeftIcon, ChevronRightIcon } from "@primer/octicons-react";
import useEmblaCarousel from "embla-carousel-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import Skeleton from "react-loading-skeleton";

import type { GameShop } from "@types";
import { VerticalCoverCard } from "@renderer/components";
import { HoverPreviewImages } from "@renderer/components/hover-preview-images/hover-preview-images";
import { StoreGameHoverCard } from "@renderer/components/store-game-card/store-game-hover-card";
import { useGameHoverPreview } from "@renderer/hooks/use-game-hover-preview";
import { buildGameDetailsPath, isGameReadyToPlay } from "@renderer/helpers";
import { useAppDispatch, useLibrary, useSimilarGames } from "@renderer/hooks";
import { setDiscoverView } from "@renderer/features";
import { useTuneSettings } from "@renderer/pages/catalogue/use-tune-settings";
import { GameLibraryBadge } from "@renderer/components";
import {
  catalogueKey,
  getCatalogueLibraryStates,
  type CatalogueLibraryState,
} from "@renderer/pages/catalogue/catalogue-library-state";
import {
  getSimilarGamesSectionState,
  type SimilarGame,
} from "@renderer/hooks/similar-games";

import "./similar-games.scss";

const GAMES_PER_PAGE = 3;

interface SimilarGamesProps {
  objectId: string;
  shop: GameShop;
}

function SimilarGamesSlide({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="similar-games__slide">{children}</div>;
}

/** One suggested game: its cover, with screenshots and a card beside it on hover. */
function SimilarGameCard({
  game,
  libraryState,
  onOpen,
}: Readonly<{
  game: SimilarGame;
  libraryState: CatalogueLibraryState | undefined;
  onOpen: () => void;
}>) {
  const anchor = useRef<HTMLDivElement>(null);
  const preview = useGameHoverPreview(game);

  return (
    <SimilarGamesSlide>
      <div
        ref={anchor}
        className="similar-games__anchor"
        {...preview.hoverProps}
      >
        <GameLibraryBadge overlay state={libraryState} />
        <VerticalCoverCard
          className="similar-games__card"
          gameTitle={game.title}
          coverImageUrls={[
            game.coverImageUrl,
            game.libraryImageUrl,
            game.iconUrl,
          ]}
          useClassicsLayout={game.shop === "launchbox"}
          showTitleTooltip={false}
          onClick={onOpen}
        >
          <HoverPreviewImages
            urls={preview.previewUrls}
            activeUrl={preview.previewUrl}
          />
        </VerticalCoverCard>
      </div>
      {preview.cardOpen && (
        <StoreGameHoverCard
          anchor={anchor.current}
          title={game.title}
          facts={preview.facts}
          fitWidth
        />
      )}
    </SimilarGamesSlide>
  );
}

function SimilarGamesSkeleton() {
  return (
    <div className="similar-games__carousel" aria-busy="true">
      <div className="similar-games__viewport">
        <div className="similar-games__container">
          {Array.from({ length: GAMES_PER_PAGE }, (_, index) => (
            <SimilarGamesSlide key={`similar-game-skeleton-${index}`}>
              <Skeleton className="similar-games__skeleton" />
            </SimilarGamesSlide>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SimilarGames({ objectId, shop }: Readonly<SimilarGamesProps>) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const tune = useTuneSettings();
  const { t } = useTranslation("game_details");

  // The recommender's own list from this game, with the Tune panel beside it.
  const openMoreLikeThis = () => {
    tune.setOptions({ basedOn: "games", pickedGames: [`steam:${objectId}`] });
    dispatch(setDiscoverView("for-you"));
    navigate("/catalogue");
  };
  const {
    games: similarGames,
    isLoading,
    isEligible,
  } = useSimilarGames({
    objectId,
    shop,
  });
  const { library } = useLibrary();
  const libraryStates = useMemo(
    () => getCatalogueLibraryStates(library, isGameReadyToPlay),
    [library]
  );
  // Games you own first, so they sit next to the ones to discover.
  const games = useMemo(
    () =>
      [...similarGames].sort(
        (a, b) =>
          Number(libraryStates.has(catalogueKey(b))) -
          Number(libraryStates.has(catalogueKey(a)))
      ),
    [similarGames, libraryStates]
  );
  const sectionState = getSimilarGamesSectionState(
    isEligible,
    isLoading,
    games.length
  );
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    slidesToScroll: GAMES_PER_PAGE,
    duration: 20,
  });
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const syncControls = useCallback(() => {
    setCanScrollPrev(emblaApi?.canScrollPrev() ?? false);
    setCanScrollNext(emblaApi?.canScrollNext() ?? false);
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;

    syncControls();
    emblaApi.on("select", syncControls);
    emblaApi.on("reInit", syncControls);

    return () => {
      emblaApi.off("select", syncControls);
      emblaApi.off("reInit", syncControls);
    };
  }, [emblaApi, syncControls]);

  useEffect(() => {
    emblaApi?.scrollTo(0, true);
  }, [emblaApi, objectId, shop]);

  if (sectionState === "hidden") return null;

  return (
    <section className="similar-games">
      <div className="similar-games__header">
        <h2 className="similar-games__title">{t("similar_games")}</h2>
        {shop === "steam" && (
          <button
            type="button"
            className="similar-games__more"
            onClick={openMoreLikeThis}
          >
            {t("more_like_this_in_for_you")}
          </button>
        )}
      </div>

      {sectionState === "loading" ? <SimilarGamesSkeleton /> : null}

      {sectionState === "empty" ? (
        <div className="similar-games__empty" role="status">
          {t("no_similar_games")}
        </div>
      ) : null}

      {sectionState === "ready" ? (
        <div className="similar-games__carousel">
          <div className="similar-games__viewport" ref={emblaRef}>
            <div className="similar-games__container">
              {games.map((similarGame) => (
                <SimilarGameCard
                  key={`${similarGame.shop}:${similarGame.objectId}`}
                  game={similarGame}
                  libraryState={libraryStates.get(catalogueKey(similarGame))}
                  onOpen={() => navigate(buildGameDetailsPath(similarGame))}
                />
              ))}
            </div>

            <button
              type="button"
              className="similar-games__control similar-games__control--previous"
              aria-label={t("previous_media")}
              disabled={!canScrollPrev}
              onClick={() => emblaApi?.scrollPrev()}
            >
              <ChevronLeftIcon size={36} />
            </button>

            <button
              type="button"
              className="similar-games__control similar-games__control--next"
              aria-label={t("next_media")}
              disabled={!canScrollNext}
              onClick={() => emblaApi?.scrollNext()}
            >
              <ChevronRightIcon size={36} />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
