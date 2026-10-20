import { Badge } from "@renderer/components/badge/badge";
import { buildGameDetailsPath } from "@renderer/helpers";
import { useAppSelector, useLibrary } from "@renderer/hooks";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@renderer/components/link/link";

import "./game-item.scss";
import { useTranslation } from "react-i18next";
import { CatalogueSearchResult } from "@types";
import {
  QuestionIcon,
  PlusIcon,
  CheckIcon,
  ClockIcon,
  DownloadIcon,
} from "@primer/octicons-react";
import {
  formatBytes,
  getCriticScoreTone,
  type CatalogueRowDetails,
} from "@shared";
import cn from "classnames";
import { logger } from "@renderer/logger";
import { CatalogueLibraryBadge } from "./catalogue-library-badge";
import type { CatalogueLibraryState } from "./catalogue-library-state";
import type { CatalogueView } from "./catalogue-results-cache";

const ProtonDBBadge = lazy(async () => {
  const mod = await import("./protondb-badge");
  return { default: mod.ProtonDBBadge };
});

export interface GameItemProps {
  game: CatalogueSearchResult;
  libraryState?: CatalogueLibraryState;
  details?: CatalogueRowDetails;
  view?: CatalogueView;
}

const PREVIEW_DELAY_MS = 400;
const PREVIEW_INTERVAL_MS = 1400;

/** Cycles through screenshots while the pointer rests on the cover. */
function useHoverPreview(screenshots: string[]) {
  const [hovered, setHovered] = useState(false);
  const [index, setIndex] = useState(-1);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!hovered || screenshots.length === 0) {
      setIndex(-1);
      return;
    }

    timer.current = window.setTimeout(() => {
      setIndex(0);
      timer.current = window.setInterval(
        () => setIndex((current) => (current + 1) % screenshots.length),
        PREVIEW_INTERVAL_MS
      );
    }, PREVIEW_DELAY_MS);

    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        window.clearInterval(timer.current);
      }
    };
  }, [hovered, screenshots.length]);

  return {
    previewUrl: index >= 0 ? screenshots[index] : null,
    hoverProps: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
    },
  };
}

export function GameItem({
  game,
  libraryState,
  details,
  view = "list",
}: GameItemProps) {
  const { i18n, t } = useTranslation("game_details");
  const { previewUrl, hoverProps } = useHoverPreview(
    details?.screenshots ?? []
  );

  const language = i18n.language.split("-")[0];

  const { steamGenres } = useAppSelector((state) => state.catalogueSearch);

  const [isAddingToLibrary, setIsAddingToLibrary] = useState(false);

  const added = Boolean(libraryState);

  const { updateLibrary } = useLibrary();
  const shouldShowProtonFeatures = window.electron.platform === "linux";

  const addGameToLibrary = async () => {
    if (added || isAddingToLibrary) return;

    setIsAddingToLibrary(true);

    try {
      await window.electron.addGameToLibrary(
        game.shop,
        game.objectId,
        game.title,
        game.platform ?? null
      );
      updateLibrary();
    } catch (error) {
      logger.error("Failed to add game to library", error);
    } finally {
      setIsAddingToLibrary(false);
    }
  };

  const genres = useMemo(() => {
    return game.genres?.map((genre) => {
      const index = steamGenres["en"]?.findIndex(
        (steamGenre) => steamGenre === genre
      );

      if (
        index !== undefined &&
        steamGenres[language] &&
        steamGenres[language][index]
      ) {
        return steamGenres[language][index];
      }

      return genre;
    });
  }, [game.genres, language, steamGenres]);

  const libraryImage = useMemo(() => {
    if (game.libraryImageUrl) {
      return (
        <img
          className="game-item__cover"
          src={game.libraryImageUrl}
          alt={game.title}
          width={view === "grid" ? 460 : 200}
          height={view === "grid" ? 215 : 103}
          loading="lazy"
        />
      );
    }

    return (
      <div className="game-item__cover-placeholder">
        <QuestionIcon size={28} />
      </div>
    );
  }, [game.libraryImageUrl, game.title, view]);

  const rawProtonValue =
    game.tier ??
    game.bestReportedTier ??
    game.protondbSupportBadge ??
    game.protondbSupportBadges?.[0] ??
    null;
  const protonBadgeValue = rawProtonValue?.toLowerCase().trim() ?? null;
  const protonBadge =
    protonBadgeValue &&
    ["borked", "bronze", "silver", "gold", "platinum"].includes(
      protonBadgeValue
    )
      ? protonBadgeValue
      : null;

  const hasFacts =
    details &&
    (details.criticScore !== null ||
      details.howLongToBeatHours !== null ||
      details.downloadSize !== null);

  return (
    <article className={cn("game-item", `game-item--${view}`)} {...hoverProps}>
      <Link to={buildGameDetailsPath(game)} className="game-item__content-link">
        <div className="game-item__cover-wrapper">
          {libraryImage}
          {previewUrl && (
            <img
              key={previewUrl}
              className="game-item__preview"
              src={previewUrl}
              alt=""
            />
          )}

          {shouldShowProtonFeatures && protonBadge && (
            <Suspense fallback={null}>
              <ProtonDBBadge badge={protonBadge} />
            </Suspense>
          )}
        </div>

        <div className="game-item__details">
          <span className="game-item__title-row">
            <span className="game-item__title">{game.title}</span>
            <CatalogueLibraryBadge state={libraryState} />
          </span>
          {genres && genres.length > 0 ? (
            <span className="game-item__genres">{genres.join(", ")}</span>
          ) : (
            <span className="game-item__genres game-item__genres--empty">
              {t("no_genres", { ns: "catalogue" })}
            </span>
          )}

          {hasFacts && (
            <div className="game-item__facts">
              {details.criticScore !== null && (
                <span
                  className={`game-item__critic-score game-item__critic-score--${getCriticScoreTone(details.criticScore)}`}
                  title={t("metacritic_score", { ns: "catalogue" })}
                >
                  {details.criticScore}
                </span>
              )}
              {details.howLongToBeatHours !== null && (
                <span
                  className="game-item__fact"
                  title={t("how_long_to_beat_main", { ns: "catalogue" })}
                >
                  <ClockIcon size={12} />
                  {t("hours_short", {
                    ns: "catalogue",
                    hours: Math.round(details.howLongToBeatHours),
                  })}
                </span>
              )}
              {details.downloadSize !== null && (
                <span
                  className="game-item__fact"
                  title={t("download_size", { ns: "catalogue" })}
                >
                  <DownloadIcon size={12} />
                  {formatBytes(details.downloadSize)}
                </span>
              )}
            </div>
          )}

          <div className="game-item__repackers">
            {game.downloadSources.map((sourceName) => (
              <Badge key={sourceName}>{sourceName}</Badge>
            ))}
          </div>
        </div>
      </Link>
      <button
        type="button"
        className={cn("game-item__plus-wrapper", {
          "game-item__plus-wrapper--added": added,
        })}
        onClick={addGameToLibrary}
        title={added ? t("already_in_library") : t("add_to_library")}
        aria-label={added ? t("already_in_library") : t("add_to_library")}
        disabled={added || isAddingToLibrary}
      >
        {added ? <CheckIcon size={16} /> : <PlusIcon size={16} />}
      </button>
    </article>
  );
}
