import { useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  HeartFillIcon,
  HeartIcon,
  PinIcon,
  PinSlashIcon,
  StarFillIcon,
  StarIcon,
} from "@primer/octicons-react";
import cn from "classnames";
import type { LibraryGame, PlayStatus } from "@types";
import {
  applyLibraryGroupAction,
  getCompletionSuggestion,
  getDisplayedPlayTimeInMilliseconds,
  groupLibraryGames,
} from "@shared";
import { Button, RatingInput } from "@renderer/components";
import { gameDetailsContext } from "@renderer/context";
import { buildGameDetailsPath, isGameReadyToPlay } from "@renderer/helpers";
import { useGameCard, useLibrary, useToast } from "@renderer/hooks";
import { PlayStatusMenu } from "../hero/play-status-menu";
import { SidebarSection } from "../sidebar-section/sidebar-section";
import { useGameToggles } from "../use-game-toggles";
import { GameNotesField } from "@renderer/pages/library/game-notes-field";
import { libraryTabIncludes } from "@renderer/pages/library/library-filters";
import { SteamHistorySection } from "./steam-history-section";
import { useSteamHistory } from "./use-steam-history";
import { findRelatedLibraryGames } from "./related-library-games";
import "./your-game-section.scss";

const COPY_SOURCES = ["steam", "epic", "classics", "local"] as const;

const noop = () => {};

/** Your own data for the game, apart from the store's: status, rating, notes. */
export function YourGameSection() {
  const { t } = useTranslation(["game_details", "library"]);
  const navigate = useNavigate();
  const { game, presentation, updateGame } = useContext(gameDetailsContext);
  const { library, updateLibrary } = useLibrary();
  const { showErrorToast } = useToast();
  const toggles = useGameToggles();
  const shown = (presentation ?? game) as LibraryGame | null;
  const { formatPlayTime } = useGameCard(shown as LibraryGame, noop);

  const members = useMemo(
    () => presentation?.members ?? (game ? [game] : []),
    [presentation, game]
  );

  const related = useMemo(() => {
    if (!shown) return [];
    const grouped = groupLibraryGames(
      library.filter((item) => !item.isDeleted),
      []
    );
    const memberIds = new Set(members.map((member) => member.id));
    const own = grouped.find((item) =>
      item.members.some((member) => memberIds.has(member.id))
    );
    return findRelatedLibraryGames(
      shown.title,
      grouped,
      new Set([...memberIds, ...(own ? [own.id] : [])])
    );
  }, [library, members, shown]);

  const steamAppId =
    members.find((member) => member.shop === "steam")?.objectId ?? null;
  const steamHistory = useSteamHistory(steamAppId);

  if (!game || !shown || game.isDeleted) return null;

  const achievementGame = presentation?.achievementGame ?? shown;
  // Hydra's own achievement data first; Steam's import fills in what it lacks.
  const steamAchievements = steamHistory?.achievements ?? [];
  const hydraUnlocked = achievementGame.unlockedAchievementCount ?? 0;
  const useSteamAchievements =
    (achievementGame.achievementCount ?? 0) === 0 &&
    steamAchievements.length > 0;
  const unlocked = useSteamAchievements
    ? steamAchievements.filter((item) => item.unlockTime !== null).length
    : hydraUnlocked;
  const achievementCount = useSteamAchievements
    ? steamAchievements.length
    : Math.max(achievementGame.achievementCount ?? 0, hydraUnlocked);
  const completionSuggestion = getCompletionSuggestion({
    playStatus: shown.playStatus,
    dismissed: members.some((member) => member.completionSuggestionDismissed),
    playTimeInMilliseconds: getDisplayedPlayTimeInMilliseconds(shown),
    unlockedAchievements: unlocked,
    totalAchievements: achievementCount,
    mainStoryHours: shown.metadata?.howLongToBeat?.mainStory ?? null,
  });

  const refresh = () => Promise.all([updateLibrary(), updateGame()]);

  const setPlayStatus = async (playStatus: PlayStatus | null) => {
    try {
      await applyLibraryGroupAction(members, (member) =>
        window.electron.setGamePlayStatus(
          member.shop,
          member.objectId,
          playStatus
        )
      );
    } catch {
      showErrorToast(t("failed_update_play_status"));
    } finally {
      await refresh();
    }
  };

  const dismissCompletionSuggestion = async () => {
    try {
      await applyLibraryGroupAction(members, (member) =>
        window.electron.dismissCompletionSuggestion(
          member.shop,
          member.objectId
        )
      );
    } finally {
      await refresh();
    }
  };

  const setRating = async (rating: number | null) => {
    try {
      await applyLibraryGroupAction(members, (member) =>
        window.electron.setGameRating(member.shop, member.objectId, rating)
      );
    } catch {
      showErrorToast(t("failed_update_rating"));
    } finally {
      await refresh();
    }
  };

  const copyLabel = (member: LibraryGame) => {
    const source =
      COPY_SOURCES.find((value) => libraryTabIncludes(member, value)) ??
      "local";
    return t(`group_source_${source}`, { ns: "library" });
  };

  return (
    <SidebarSection title={t("your_stuff")}>
      <div className="your-game">
        {completionSuggestion && (
          <div className="your-game__suggestion" role="status">
            <span>
              {completionSuggestion === "achievements"
                ? t("completion_suggestion_achievements", { count: unlocked })
                : t("completion_suggestion_story", {
                    hours: shown.metadata?.howLongToBeat?.mainStory,
                  })}
            </span>
            <div className="your-game__suggestion-actions">
              <Button
                size="small"
                onClick={() => void setPlayStatus("finished")}
              >
                {t("completion_suggestion_accept")}
              </Button>
              <Button
                size="small"
                theme="outline"
                onClick={() => void dismissCompletionSuggestion()}
              >
                {t("completion_suggestion_dismiss")}
              </Button>
            </div>
          </div>
        )}

        <div className="your-game__field">
          <span className="your-game__label">
            {t("play_status", { ns: "library" })}
          </span>
          <PlayStatusMenu
            playStatus={shown.playStatus ?? null}
            onChange={(playStatus) => void setPlayStatus(playStatus)}
          />
        </div>

        <div className="your-game__field">
          <span className="your-game__label">{t("your_rating")}</span>
          <RatingInput
            label={t("your_rating")}
            value={shown.rating ?? null}
            onChange={(rating) => void setRating(rating)}
          />
        </div>

        <div className="your-game__toggles">
          <Button
            size="small"
            theme="outline"
            aria-pressed={toggles.favorite}
            disabled={toggles.busy}
            className={cn("your-game__toggle", {
              "your-game__toggle--active": toggles.favorite,
            })}
            onClick={() => void toggles.toggleFavorite()}
          >
            {toggles.favorite ? <HeartFillIcon /> : <HeartIcon />}
            {t("your_game_favorite")}
          </Button>

          {toggles.canPin && (
            <Button
              size="small"
              theme="outline"
              aria-pressed={toggles.pinned}
              disabled={toggles.busy}
              className={cn("your-game__toggle", {
                "your-game__toggle--active": toggles.pinned,
              })}
              onClick={() => void toggles.togglePinned()}
            >
              {toggles.pinned ? <PinSlashIcon /> : <PinIcon />}
              {t("your_game_pin")}
            </Button>
          )}

          <Button
            size="small"
            theme="outline"
            aria-pressed={toggles.wishlisted}
            disabled={toggles.busy}
            className={cn("your-game__toggle", {
              "your-game__toggle--active": toggles.wishlisted,
            })}
            onClick={() => void toggles.toggleWishlisted()}
          >
            {toggles.wishlisted ? <StarFillIcon /> : <StarIcon />}
            {t("your_game_wishlist")}
          </Button>
        </div>

        {members.length > 1 && (
          <div className="your-game__list">
            <h3>{t("your_stuff_copies")}</h3>
            <ul>
              {members.map((member) => (
                <li key={member.id}>
                  <span className="your-game__copy-source">
                    {copyLabel(member)}
                  </span>
                  <span className="your-game__copy-state">
                    {isGameReadyToPlay(member)
                      ? t("your_stuff_installed")
                      : t("your_stuff_not_installed")}
                    {getDisplayedPlayTimeInMilliseconds(member) > 0 &&
                      ` · ${formatPlayTime(getDisplayedPlayTimeInMilliseconds(member))}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {related.length > 0 && (
          <div className="your-game__list">
            <h3>{t("your_stuff_related")}</h3>
            <ul className="your-game__related">
              {related.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="your-game__related-link"
                    onClick={() =>
                      navigate(
                        buildGameDetailsPath({ ...item, ...item.catalogueGame })
                      )
                    }
                  >
                    {item.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {steamAppId && <SteamHistorySection history={steamHistory} />}

        <GameNotesField game={presentation ?? game} />
      </div>
    </SidebarSection>
  );
}
