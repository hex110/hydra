import { ChevronLeftIcon, ChevronRightIcon } from "@primer/octicons-react";
import useEmblaCarousel from "embla-carousel-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import Skeleton from "react-loading-skeleton";

import type { GameShop } from "@types";
import { VerticalCoverCard } from "@renderer/components";
import { buildGameDetailsPath, isGameReadyToPlay } from "@renderer/helpers";
import { useLibrary, useSimilarGames } from "@renderer/hooks";
import { CatalogueLibraryBadge } from "@renderer/pages/catalogue/catalogue-library-badge";
import {
  catalogueKey,
  getCatalogueLibraryStates,
} from "@renderer/pages/catalogue/catalogue-library-state";
import { getSimilarGamesSectionState } from "@renderer/hooks/similar-games";

import "./similar-games.scss";

const GAMES_PER_PAGE = 3;

interface SimilarGamesProps {
  objectId: string;
  shop: GameShop;
}

function SimilarGamesSlide({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="similar-games__slide">{children}</div>;
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
  const { t } = useTranslation("game_details");
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
      <h2 className="similar-games__title">{t("similar_games")}</h2>

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
                <SimilarGamesSlide
                  key={`${similarGame.shop}:${similarGame.objectId}`}
                >
                  <CatalogueLibraryBadge
                    state={libraryStates.get(catalogueKey(similarGame))}
                  />
                  <VerticalCoverCard
                    className="similar-games__card"
                    gameTitle={similarGame.title}
                    coverImageUrls={[
                      similarGame.coverImageUrl,
                      similarGame.libraryImageUrl,
                      similarGame.iconUrl,
                    ]}
                    useClassicsLayout={similarGame.shop === "launchbox"}
                    showTitleTooltip={false}
                    onClick={() => navigate(buildGameDetailsPath(similarGame))}
                  />
                </SimilarGamesSlide>
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
