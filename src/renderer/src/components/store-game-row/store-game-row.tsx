import type { ReactNode } from "react";
import cn from "classnames";
import type { StoreGameFacts } from "@shared";
import { buildGameDetailsPath } from "@renderer/helpers";
import { useHoverPreview } from "@renderer/hooks/use-hover-preview";
import { Link } from "@renderer/components/link/link";
import {
  StoreGameActions,
  type StoreGameFeedback,
} from "@renderer/components/store-game-actions/store-game-actions";
import { StoreGameMeta } from "@renderer/components/store-game-meta/store-game-meta";
import { StoreGameCover } from "@renderer/components/store-game-card/store-game-cover";
import { SourceBadges } from "@renderer/components/store-game-card/source-badges";
import type { StoreGameCardGame } from "@renderer/components/store-game-card/store-game-card";
import type { CatalogueLibraryState } from "@renderer/pages/catalogue/catalogue-library-state";
import "./store-game-row.scss";

export interface StoreGameRowProps {
  game: StoreGameCardGame;
  facts?: StoreGameFacts;
  libraryState?: CatalogueLibraryState;
  reason?: string;
  /** Longer words for the reason, shown on hover. */
  reasonTitle?: string;
  badge?: ReactNode;
  sources?: string[];
  canDownload?: boolean;
  onNotInterested?: () => void;
  feedback?: StoreGameFeedback;
}

/** A store game as a row: the same content as the card, beside a smaller cover. */
export function StoreGameRow({
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
}: Readonly<StoreGameRowProps>) {
  const { previewUrl, hoverProps } = useHoverPreview(facts?.screenshots ?? []);

  return (
    <article className={cn("store-game", "store-game-row")} {...hoverProps}>
      <StoreGameCover
        game={game}
        libraryState={libraryState}
        previewUrl={previewUrl}
        variant="row"
      >
        <StoreGameActions
          game={game}
          libraryState={libraryState}
          canDownload={canDownload}
          onNotInterested={onNotInterested}
          feedback={feedback}
        />
      </StoreGameCover>
      <div className="store-game-row__body">
        <Link
          to={buildGameDetailsPath(game)}
          className="store-game-row__title"
          title={game.title}
        >
          {game.title}
        </Link>
        {reason && (
          <span className="store-game-row__reason" title={reasonTitle}>
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
    </article>
  );
}
