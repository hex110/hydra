import SteamLogo from "@renderer/assets/steam-logo.svg?react";
import EpicLogo from "@renderer/assets/epic-integration-logo.svg?react";
import { LibraryGame } from "@types";
import {
  getGameCatalogueIdentity,
  getLibraryGameMembers,
  getLibraryOperationalGame,
} from "@shared";
import cn from "classnames";
import { useLocation } from "react-router-dom";
import { memo, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ConfirmationModal,
  GameContextMenu,
  SteamIcon,
  SteamLibraryBadge,
  useGameActions,
} from "..";
import { AlertIcon, HeartFillIcon, ToolsIcon } from "@primer/octicons-react";
import { useAppSelector, useToast } from "@renderer/hooks";
import { isGameInstalled, launchesThroughSteam } from "@renderer/helpers";
import { useCollectionContextMenu } from "@renderer/context";
import {
  getLibraryPresentationBadgeSource,
  getLibraryPresentationImportSources,
} from "@renderer/pages/library/library-category";

const FAILED_ICON_RETRY_MS = 60_000;

interface SidebarGameItemProps {
  game: LibraryGame;
  handleSidebarGameClick: (game: LibraryGame) => void;
  getGameTitle: (game: LibraryGame) => string;
  playingGameId?: string;
  playingModded?: boolean;
}

export const SidebarGameItem = memo(function SidebarGameItem({
  game,
  handleSidebarGameClick,
  getGameTitle,
  playingGameId,
  playingModded = false,
}: Readonly<SidebarGameItemProps>) {
  const location = useLocation();
  const { t } = useTranslation("game_details");
  const { showWarningToast } = useToast();
  const {
    canPlay,
    handlePlayGame,
    rpcs3ConfirmPending,
    handleConfirmRpcs3Launch,
    handleCancelRpcs3Launch,
  } = useGameActions(getLibraryOperationalGame(game));
  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );
  const { openCollectionContextMenu } = useCollectionContextMenu();
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    position: { x: number; y: number };
  }>({ visible: false, position: { x: 0, y: 0 } });

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    setContextMenu({
      visible: true,
      position: { x: event.clientX, y: event.clientY },
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu({ visible: false, position: { x: 0, y: 0 } });
  };

  const isCustomGame = game.shop === "custom";
  const catalogueIdentity = getGameCatalogueIdentity(game);
  const badgeSource = getLibraryPresentationBadgeSource(game);
  const isPlaying =
    playingGameId !== undefined &&
    getLibraryGameMembers(game).some((member) => member.id === playingGameId);
  // The Steam mark on the right replaces the corner badge for Steam games.
  const isOwnedOnSteam =
    game.ownedOnSteam === true ||
    getLibraryPresentationImportSources(game).steam;
  const opensThroughSteam = launchesThroughSteam(
    getLibraryOperationalGame(game)
  );
  const showSteamMark =
    (isOwnedOnSteam || opensThroughSteam) &&
    !userPreferences?.hideSteamLibraryBadges;
  const sidebarIcon = isCustomGame
    ? game.libraryImageUrl || game.iconUrl
    : game.customIconUrl || game.iconUrl;
  const [failedIcon, setFailedIcon] = useState<string | null>(null);
  useEffect(() => setFailedIcon(null), [sidebarIcon]);
  useEffect(() => {
    if (!failedIcon) return;
    const retry = window.setTimeout(
      () => setFailedIcon(null),
      FAILED_ICON_RETRY_MS
    );
    return () => window.clearTimeout(retry);
  }, [failedIcon]);

  // Determine fallback icon based on game type
  const getFallbackIcon = () => {
    if (isCustomGame) {
      return null;
    }
    if (game.shop === "epic") {
      return <EpicLogo className="sidebar__game-icon" />;
    }
    return <SteamLogo className="sidebar__game-icon" />;
  };

  return (
    <>
      <li
        key={game.id}
        className={cn("sidebar__menu-item", {
          "sidebar__menu-item--active":
            location.pathname ===
            `/game/${catalogueIdentity.shop}/${catalogueIdentity.objectId}`,
          "sidebar__menu-item--playing": isPlaying,
          "sidebar__menu-item--muted": game.download?.status === "removed",
          "sidebar__menu-item--not-installed": !isGameInstalled(game),
        })}
      >
        <button
          type="button"
          className="sidebar__menu-item-button"
          onClick={(event) => {
            handleSidebarGameClick(game);
            if (event.detail === 2) {
              if (canPlay) {
                void handlePlayGame();
              } else {
                showWarningToast(
                  game.shop === "launchbox"
                    ? t("game_has_no_disc_hint", {
                        ns: "sidebar",
                        options: t("options"),
                        settings: t("settings", { ns: "sidebar" }),
                        emulation: t("emulation", { ns: "settings" }),
                      })
                    : t("game_has_no_executable_hint", {
                        ns: "sidebar",
                        options: t("options"),
                        locations: t("settings_category_locations"),
                      })
                );
              }
            }
          }}
          onContextMenu={handleContextMenu}
        >
          <span className="sidebar__game-icon-container">
            {sidebarIcon && sidebarIcon !== failedIcon ? (
              <img
                className="sidebar__game-icon"
                src={sidebarIcon}
                alt={game.title}
                loading="lazy"
                onError={() => setFailedIcon(sidebarIcon)}
              />
            ) : (
              getFallbackIcon()
            )}
            {badgeSource === "epic" &&
              !userPreferences?.hideEpicLibraryBadges && (
                <SteamLibraryBadge
                  source="epic"
                  variant="sidebar"
                  availableShops={game.availableShops}
                  hasActiveSteamImport={game.hasActiveSteamImport}
                  hasActiveEpicImport={game.hasActiveEpicImport}
                />
              )}
          </span>

          <span className="sidebar__menu-item-button-label">
            {getGameTitle(game)}
          </span>

          {userPreferences?.enableNewDownloadOptionsBadges !== false &&
            (game.newDownloadOptionsCount ?? 0) > 0 && (
              <span className="sidebar__game-badge">
                +{game.newDownloadOptionsCount}
              </span>
            )}

          {game.executableStatus && (
            <span
              className="sidebar__game-missing-icon"
              title={t(`executable_status_${game.executableStatus}`)}
            >
              <AlertIcon size={12} />
            </span>
          )}

          {isPlaying && playingModded && (
            <span
              className="sidebar__game-modded-icon"
              title={t("playing_modded", { ns: "sidebar" })}
            >
              <ToolsIcon size={12} />
            </span>
          )}

          {game.favorite && (
            <HeartFillIcon size={12} className="sidebar__game-favorite-icon" />
          )}

          {showSteamMark && (
            <span
              className="sidebar__game-steam-icon"
              title={t(
                opensThroughSteam ? "opens_through_steam" : "owned_on_steam",
                { ns: "sidebar" }
              )}
            >
              <SteamIcon size={12} />
            </span>
          )}
        </button>
      </li>

      <GameContextMenu
        game={getLibraryOperationalGame(game)}
        visible={contextMenu.visible}
        position={contextMenu.position}
        onClose={handleCloseContextMenu}
        onCollectionContextMenu={openCollectionContextMenu}
      />

      <ConfirmationModal
        visible={rpcs3ConfirmPending !== null}
        title={t("rpcs3_already_running_title")}
        descriptionText={t("rpcs3_already_running_description")}
        confirmButtonLabel={t("rpcs3_already_running_confirm")}
        cancelButtonLabel={t("cancel")}
        onClose={handleCancelRpcs3Launch}
        onConfirm={handleConfirmRpcs3Launch}
      />
    </>
  );
});
