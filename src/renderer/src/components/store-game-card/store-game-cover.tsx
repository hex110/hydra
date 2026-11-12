import type { ReactNode } from "react";
import { QuestionIcon } from "@primer/octicons-react";
import cn from "classnames";
import { HoverPreviewImages } from "@renderer/components/hover-preview-images/hover-preview-images";
import { GameLibraryBadge } from "@renderer/components/game-library-badge/game-library-badge";
import type { CatalogueLibraryState } from "@renderer/pages/catalogue/catalogue-library-state";
import { getProtonDbBadge, ProtonDBBadge } from "./protondb-badge";
import "./store-game.scss";
import "./store-game-cover.scss";

export interface StoreGameCoverGame {
  title: string;
  libraryImageUrl: string | null;
  tier?: string | null;
  bestReportedTier?: string | null;
  protondbSupportBadge?: string | null;
  protondbSupportBadges?: string[];
}

const COVER_SIZES = {
  card: { width: 460, height: 215 },
  row: { width: 200, height: 94 },
};

/** A store game's header image with the library badge, ProtonDB tier and hover preview. */
export function StoreGameCover({
  game,
  libraryState,
  previewUrls,
  previewUrl,
  variant,
  children,
}: Readonly<{
  game: StoreGameCoverGame;
  libraryState?: CatalogueLibraryState;
  /** Screenshots that have loaded; all stay mounted so the swap never shows the cover. */
  previewUrls: string[];
  previewUrl: string | null;
  variant: "card" | "row";
  /** The action buttons. */
  children?: ReactNode;
}>) {
  const protonBadge =
    window.electron.platform === "linux" ? getProtonDbBadge(game) : null;

  return (
    <div className={cn("store-game-cover", `store-game-cover--${variant}`)}>
      {game.libraryImageUrl ? (
        <img
          className="store-game-cover__image"
          src={game.libraryImageUrl}
          alt=""
          {...COVER_SIZES[variant]}
          loading="lazy"
        />
      ) : (
        <div className="store-game-cover__placeholder">
          <QuestionIcon size={28} />
        </div>
      )}
      <HoverPreviewImages urls={previewUrls} activeUrl={previewUrl} />
      <GameLibraryBadge state={libraryState} overlay />
      {protonBadge && <ProtonDBBadge badge={protonBadge} />}
      {children}
    </div>
  );
}
