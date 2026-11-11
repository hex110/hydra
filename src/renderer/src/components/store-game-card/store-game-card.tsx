import { useRef, type ReactNode } from "react";
import cn from "classnames";
import Skeleton from "react-loading-skeleton";
import type { StoreGameFacts } from "@shared";
import { buildGameDetailsPath } from "@renderer/helpers";
import { useHoverPreview } from "@renderer/hooks/use-hover-preview";
import { Link } from "@renderer/components/link/link";
import {
  StoreGameActions,
  type StoreGameFeedback,
} from "@renderer/components/store-game-actions/store-game-actions";
import type { StoreGameIdentity } from "@renderer/components/store-game-actions/store-game-actions";
import { StoreGameMeta } from "@renderer/components/store-game-meta/store-game-meta";
import { SourceBadges } from "./source-badges";
import type { CatalogueLibraryState } from "@renderer/pages/catalogue/catalogue-library-state";
import { StoreGameCover, type StoreGameCoverGame } from "./store-game-cover";
import { StoreGameHoverCard } from "./store-game-hover-card";
import "./store-game-card.scss";

export interface StoreGameCardGame
  extends StoreGameIdentity,
    StoreGameCoverGame {
  releaseYear?: number | null;
  genres?: string[];
}

export interface StoreGameCardProps {
  game: StoreGameCardGame;
  facts?: StoreGameFacts;
  libraryState?: CatalogueLibraryState;
  /** Why the game is shown, e.g. "Because you played Hades". */
  reason?: string;
  /** Longer words for the reason, shown on hover. */
  reasonTitle?: string;
  /** A chip of its own, e.g. an AnkerGames version or a chart rank. */
  badge?: ReactNode;
  /** Names of the download sources that have it. */
  sources?: string[];
  canDownload?: boolean;
  onNotInterested?: () => void;
  feedback?: StoreGameFeedback;
  size: "shelf" | "grid";
}

/** A store game as its wide header image with the facts under it. */
export function StoreGameCard({
  game,
  facts,
  libraryState,
  reason,
  reasonTitle,
  badge,
  sources,
  canDownload,
  onNotInterested,
  feedback,
  size,
}: Readonly<StoreGameCardProps>) {
  const { previewUrls, previewUrl, cardOpen, hoverProps } = useHoverPreview(
    facts?.screenshots ?? []
  );
  const article = useRef<HTMLElement>(null);

  return (
    <article
      ref={article}
      className={cn(
        "store-game",
        "store-game-card",
        `store-game-card--${size}`
      )}
      {...hoverProps}
    >
      <StoreGameCover
        game={game}
        libraryState={libraryState}
        previewUrls={previewUrls}
        previewUrl={previewUrl}
        variant="card"
      >
        <StoreGameActions
          game={game}
          libraryState={libraryState}
          canDownload={canDownload}
          onNotInterested={onNotInterested}
          feedback={feedback}
        />
      </StoreGameCover>
      <div className="store-game-card__body">
        <Link
          to={buildGameDetailsPath(game)}
          className="store-game-card__title"
          title={game.title}
        >
          {game.title}
        </Link>
        {reason && (
          <span className="store-game-card__reason" title={reasonTitle}>
            {reason}
          </span>
        )}
        <StoreGameMeta
          facts={facts}
          pending={!facts && game.shop !== "custom"}
          releaseYear={game.releaseYear}
          fallbackTags={game.genres}
          badge={badge}
        />
        <SourceBadges sources={sources} />
      </div>
      {cardOpen && (
        <StoreGameHoverCard
          anchor={article.current}
          title={game.title}
          facts={facts}
          fallbackTags={game.genres}
        />
      )}
    </article>
  );
}

/** The same card while its game is loading. */
export function StoreGameCardSkeleton({
  size,
}: Readonly<{ size: "shelf" | "grid" }>) {
  return (
    <div
      className={cn(
        "store-game-card",
        "store-game-card--skeleton",
        `store-game-card--${size}`
      )}
      aria-hidden
    >
      <Skeleton className="store-game-card__skeleton-cover" />
      <div className="store-game-card__body">
        <Skeleton width="70%" height={16} />
      </div>
    </div>
  );
}
