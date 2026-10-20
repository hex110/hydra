import { LibraryGame } from "@types";
import { getDisplayedPlayTimeInMilliseconds } from "@shared";
import cn from "classnames";
import { getLibraryPresentationBadgeSource } from "./library-category";
import {
  useGameCard,
  useCoverPoster,
  isAnimatedCoverCandidate,
  useAppSelector,
  useAnimatedSourceWarmup,
} from "@renderer/hooks";
import {
  CLASSICS_PS_PLATFORM_LABELS,
  isGameReadyToPlay,
  resolveClassicsBadge,
} from "@renderer/helpers";
import { AchievementProgress, SteamLibraryBadge } from "@renderer/components";
import { GameVisibilityBadge } from "@renderer/components/game-visibility-badge/game-visibility-badge";
import { memo, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClockIcon, AlertFillIcon, ImageIcon } from "@primer/octicons-react";
import {
  EMULATOR_ICONS,
  RETROARCH_EMULATOR_ICON,
} from "@renderer/pages/settings/emulation/emulator-icons";
import { LibraryCardActivity } from "./library-card-activity";
import { LibraryCardPlayButton } from "./library-card-play-button";
import { PlayStatusBadge } from "./play-status-badge";
import "./library-game-card.scss";
import { logger } from "@renderer/logger";

interface LibraryGameCardProps {
  game: LibraryGame;
  /** Return true to select the card instead of opening the game. */
  onCardClick?: (game: LibraryGame, event: React.MouseEvent) => boolean;
  onCardDoubleClick?: (game: LibraryGame) => void;
  selected?: boolean;
  focused?: boolean;
  onContextMenu: (
    game: LibraryGame,
    position: { x: number; y: number }
  ) => void;
  onShowTooltip?: (gameId: string) => void;
  onHideTooltip?: () => void;
}

export const LibraryGameCard = memo(function LibraryGameCard({
  game,
  onContextMenu,
  onCardClick,
  onCardDoubleClick,
  selected = false,
  focused = false,
}: Readonly<LibraryGameCardProps>) {
  const { t } = useTranslation("library");
  const { formatPlayTime, handleCardClick, handleContextMenuClick } =
    useGameCard(game, onContextMenu);

  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );
  const hideBadges = userPreferences?.hideLibraryGameBadges ?? false;
  const hideReadySizeBadges =
    userPreferences?.hideLibraryReadySizeBadges ?? false;
  const hideClassicsBadges =
    userPreferences?.hideLibraryClassicsBadges ?? false;
  const badgeSource = getLibraryPresentationBadgeSource(game);
  const showEpicLibraryBadge =
    badgeSource === "epic" && !userPreferences?.hideEpicLibraryBadges;
  const showSteamLibraryBadge =
    badgeSource === "steam" && !userPreferences?.hideSteamLibraryBadges;
  const hideAchievementProgress =
    userPreferences?.hideLibraryAchievementProgress ?? false;
  const autoplayAnimatedArtwork =
    userPreferences?.autoplayAnimatedArtwork ?? false;

  const isInstalled = isGameReadyToPlay(game);

  const hasPickedCover = Boolean(game.selectedArtworkTypes?.includes("grid"));

  const candidates = [
    { url: game.customCoverImageUrl, isChosenCover: true }, // Level 0
    { url: game.coverImageUrl, isChosenCover: hasPickedCover }, // Level 1
    { url: game.libraryImageUrl, isChosenCover: false }, // Level 2
    { url: game.iconUrl, isChosenCover: false }, // Level 3
  ].filter(({ url }) => url && url.trim() !== "");

  const sources = candidates.map(({ url }) => url);

  const [fallbackIndex, setFallbackIndex] = useState(0);
  const [imageError, setImageError] = useState(false);

  const resolveImageSource = (imageUrl: string | null | undefined): string => {
    if (!imageUrl) return "";

    const trimmedImageUrl = imageUrl.trim();
    if (!trimmedImageUrl) return "";

    if (
      trimmedImageUrl.startsWith("http://") ||
      trimmedImageUrl.startsWith("https://") ||
      trimmedImageUrl.startsWith("data:") ||
      trimmedImageUrl.startsWith("blob:")
    ) {
      return trimmedImageUrl;
    }

    if (trimmedImageUrl.startsWith("local:")) {
      const normalizedLocalPath = trimmedImageUrl
        .slice("local:".length)
        .replaceAll("\\", "/");
      return `local:${normalizedLocalPath}`;
    }

    const normalizedPath = trimmedImageUrl.replaceAll("\\", "/");
    if (/^[A-Za-z]:\//.test(normalizedPath) || normalizedPath.startsWith("/")) {
      return `local:${normalizedPath}`;
    }

    return normalizedPath;
  };

  const activeImageSource = resolveImageSource(sources[fallbackIndex]);
  const isChosenCoverActive = Boolean(candidates[fallbackIndex]?.isChosenCover);

  const rawActiveSource = sources[fallbackIndex];
  const isAnimatedCover = isAnimatedCoverCandidate(rawActiveSource);
  const coverPoster = useCoverPoster(rawActiveSource, isAnimatedCover);
  const [isCoverHovered, setIsCoverHovered] = useState(false);
  const shouldHoldFrame =
    isAnimatedCover && !isCoverHovered && !autoplayAnimatedArtwork;
  const isAwaitingPoster = shouldHoldFrame && coverPoster === undefined;

  useAnimatedSourceWarmup(
    activeImageSource,
    isAnimatedCover && !autoplayAnimatedArtwork && Boolean(coverPoster)
  );
  const displayImageSource =
    shouldHoldFrame && coverPoster
      ? resolveImageSource(coverPoster)
      : activeImageSource;

  const { label: classicsPlatformLabel, icon: classicsEmulatorIcon } =
    resolveClassicsBadge(
      game.shop,
      game.platform,
      CLASSICS_PS_PLATFORM_LABELS,
      {
        emulatorIcons: EMULATOR_ICONS,
        retroarchIcon: RETROARCH_EMULATOR_ICON,
      }
    );

  const showPlatformBadge =
    !hideClassicsBadges && Boolean(classicsPlatformLabel);
  // Installed is the norm; only the emulator that runs a classic is shown.
  const showEmulatorBadge =
    !hideReadySizeBadges && isInstalled && Boolean(classicsEmulatorIcon);
  const displayedPlayTime = getDisplayedPlayTimeInMilliseconds(game);
  const showPlayTime =
    !hideBadges &&
    // Under a minute would read "0m".
    (displayedPlayTime >= 60_000 || game.hasManuallyUpdatedPlaytime);

  const [isPlayPending, setIsPlayPending] = useState(false);
  const handlePlayPendingChange = useCallback(
    (pending: boolean) => setIsPlayPending(pending),
    []
  );
  const showPlayButton = isInstalled && (isCoverHovered || isPlayPending);

  const handleImageError = () => {
    logger.warn(`Image failed to load for ${game.title}`, {
      failedUrl: sources[fallbackIndex],
      level: fallbackIndex,
    });

    if (fallbackIndex < sources.length - 1) {
      setFallbackIndex((prevIndex) => prevIndex + 1);
    } else {
      setImageError(true);
    }
  };

  useEffect(() => {
    setFallbackIndex(0);
    setImageError(false);
  }, [
    game.id,
    game.customCoverImageUrl,
    game.coverImageUrl,
    game.libraryImageUrl,
    game.iconUrl,
  ]);

  const renderCoverMedia = () => {
    if (imageError || !activeImageSource) {
      return (
        <div className="library-game-card__cover-placeholder">
          <ImageIcon size={48} />
        </div>
      );
    }

    if (isAwaitingPoster) {
      return <div className="library-game-card__cover-placeholder" />;
    }

    if (game.shop === "launchbox" && !isChosenCoverActive) {
      return (
        <div className="library-game-card__classics-cover">
          <img
            src={displayImageSource}
            alt=""
            aria-hidden="true"
            className="library-game-card__classics-backdrop"
            loading="lazy"
            onError={handleImageError}
          />
          <img
            src={displayImageSource}
            alt={game.title}
            className="library-game-card__classics-image"
            loading="lazy"
            onError={handleImageError}
          />
        </div>
      );
    }

    return (
      <img
        src={displayImageSource}
        alt={game.title}
        className={`library-game-card__game-image ${
          isChosenCoverActive ? "library-game-card__game-image--contain" : ""
        }`}
        loading="lazy"
        onError={handleImageError}
      />
    );
  };

  return (
    <div
      className={cn("library-game-card__container", {
        "library-game-card__container--not-installed": !isInstalled,
        "library-game-card__container--selected": selected,
        "library-game-card__container--focused": focused,
      })}
      onMouseEnter={() => setIsCoverHovered(true)}
      onMouseLeave={() => setIsCoverHovered(false)}
    >
      <button
        type="button"
        className="library-game-card__wrapper"
        onClick={(event) => {
          if (onCardClick?.(game, event)) return;
          handleCardClick();
        }}
        onDoubleClick={() => onCardDoubleClick?.(game)}
        onContextMenu={handleContextMenuClick}
        aria-pressed={onCardClick ? selected : undefined}
      >
        <div
          className={cn("library-game-card__overlay", {
            "library-game-card__overlay--classics":
              game.shop === "launchbox" && !isChosenCoverActive,
            "library-game-card__overlay--no-fade":
              hideAchievementProgress ||
              ((game.achievementCount ?? 0) === 0 &&
                (game.unlockedAchievementCount ?? 0) === 0),
          })}
        >
          <div className="library-game-card__top-section">
            <div className="library-game-card__top-left">
              <GameVisibilityBadge
                isHiddenFromOthers={game.isHiddenFromOthers}
                isConcealed={game.isConcealed}
              />
              {showPlayTime && (
                <div className="library-game-card__playtime">
                  {game.hasManuallyUpdatedPlaytime ? (
                    <AlertFillIcon
                      size={11}
                      className="library-game-card__manual-playtime"
                    />
                  ) : (
                    <ClockIcon size={11} />
                  )}
                  <span className="library-game-card__playtime-long">
                    {formatPlayTime(displayedPlayTime)}
                  </span>
                  <span className="library-game-card__playtime-short">
                    {formatPlayTime(displayedPlayTime, true)}
                  </span>
                </div>
              )}
              {!hideBadges && <PlayStatusBadge playStatus={game.playStatus} />}
            </div>

            {(showSteamLibraryBadge ||
              showEpicLibraryBadge ||
              showPlatformBadge ||
              showEmulatorBadge) && (
              <div className="library-game-card__top-right">
                {showEpicLibraryBadge && (
                  <SteamLibraryBadge
                    source="epic"
                    availableShops={game.availableShops}
                    hasActiveSteamImport={game.hasActiveSteamImport}
                    hasActiveEpicImport={game.hasActiveEpicImport}
                  />
                )}
                {showSteamLibraryBadge && (
                  <SteamLibraryBadge
                    availableShops={game.availableShops}
                    hasActiveSteamImport={game.hasActiveSteamImport}
                    hasActiveEpicImport={game.hasActiveEpicImport}
                  />
                )}

                {showPlatformBadge && (
                  <div className="library-game-card__classics-badges">
                    <span className="library-game-card__platform-badge">
                      {classicsPlatformLabel}
                    </span>
                  </div>
                )}

                {showEmulatorBadge && classicsEmulatorIcon && (
                  <div
                    className="library-game-card__installed-badge library-game-card__installed-badge--classics"
                    title={t("installed_tooltip")}
                  >
                    <img
                      src={classicsEmulatorIcon}
                      alt=""
                      className="library-game-card__installed-emulator-icon"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {!hideAchievementProgress &&
            ((game.achievementCount ?? 0) > 0 ||
              (game.unlockedAchievementCount ?? 0) > 0) && (
              <AchievementProgress
                achievementCount={Math.max(
                  game.achievementCount ?? 0,
                  game.unlockedAchievementCount ?? 0
                )}
                unlockedAchievementCount={game.unlockedAchievementCount ?? 0}
                classNamePrefix="library-game-card"
                label={`${game.title} achievements`}
              />
            )}
        </div>

        {renderCoverMedia()}
        <LibraryCardActivity game={game} />
      </button>
      {showPlayButton && (
        <LibraryCardPlayButton
          game={game}
          onPendingChange={handlePlayPendingChange}
        />
      )}
    </div>
  );
});
