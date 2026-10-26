import { useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { SyncIcon } from "@primer/octicons-react";
import type { LibraryGame, PlayStatus } from "@types";
import {
  applyLibraryGroupAction,
  formatReleaseVersion,
  getCompletionSuggestion,
  getDisplayedPlayTimeInMilliseconds,
  groupLibraryGames,
  parseReleaseVersion,
} from "@shared";
import { Button } from "@renderer/components";
import { gameDetailsContext } from "@renderer/context";
import { buildGameDetailsPath, isGameReadyToPlay } from "@renderer/helpers";
import { useDate, useGameCard, useLibrary, useToast } from "@renderer/hooks";
import { PlayStatusMenu } from "../hero/play-status-menu";
import { GameNotesField } from "@renderer/pages/library/game-notes-field";
import { libraryTabIncludes } from "@renderer/pages/library/library-filters";
import { SteamHistorySection } from "./steam-history-section";
import { useSteamHistory } from "./use-steam-history";
import { findRelatedLibraryGames } from "./related-library-games";
import "./your-stuff.scss";

const COPY_SOURCES = ["steam", "epic", "classics", "local"] as const;

const RATINGS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

const noop = () => {};

const describeRelease = (title: string) =>
  formatReleaseVersion(parseReleaseVersion(title)) ?? title;

/** Your own data for the game, apart from the store details (Steam's "Your stuff"). */
export function YourStuff() {
  const { t } = useTranslation(["game_details", "library"]);
  const navigate = useNavigate();
  const { game, presentation, updateGame } = useContext(gameDetailsContext);
  const { library, updateLibrary } = useLibrary();
  const { formatDistance } = useDate();
  const { showErrorToast } = useToast();
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

  const playTime = getDisplayedPlayTimeInMilliseconds(shown);
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
    playTimeInMilliseconds: playTime,
    unlockedAchievements: unlocked,
    totalAchievements: achievementCount,
    mainStoryHours: shown.metadata?.howLongToBeat?.mainStory ?? null,
  });
  const availableUpdate = members.find(
    (member) => member.availableUpdate
  )?.availableUpdate;
  const installedVersion = members.find(
    (member) => member.installedVersion
  )?.installedVersion;

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
      await Promise.all([updateLibrary(), updateGame()]);
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
      await Promise.all([updateLibrary(), updateGame()]);
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
      await Promise.all([updateLibrary(), updateGame()]);
    }
  };

  const copyLabel = (member: LibraryGame) => {
    const source =
      COPY_SOURCES.find((value) => libraryTabIncludes(member, value)) ??
      "local";
    return t(`group_source_${source}`, { ns: "library" });
  };

  return (
    <section className="your-stuff" aria-labelledby="your-stuff-title">
      <div className="your-stuff__header">
        <h2 id="your-stuff-title">{t("your_stuff")}</h2>
        <PlayStatusMenu
          playStatus={shown.playStatus ?? null}
          onChange={(playStatus) => void setPlayStatus(playStatus)}
        />
      </div>

      {completionSuggestion && (
        <div className="your-stuff__suggestion" role="status">
          <span>
            {completionSuggestion === "achievements"
              ? t("completion_suggestion_achievements", { count: unlocked })
              : t("completion_suggestion_story", {
                  hours: shown.metadata?.howLongToBeat?.mainStory,
                })}
          </span>
          <div className="your-stuff__suggestion-actions">
            <Button onClick={() => void setPlayStatus("finished")}>
              {t("completion_suggestion_accept")}
            </Button>
            <Button
              theme="outline"
              onClick={() => void dismissCompletionSuggestion()}
            >
              {t("completion_suggestion_dismiss")}
            </Button>
          </div>
        </div>
      )}

      <dl className="your-stuff__stats">
        <div>
          <dt>{t("your_rating")}</dt>
          <dd>
            <select
              className="your-stuff__rating"
              aria-label={t("your_rating")}
              value={shown.rating ?? ""}
              onChange={(event) =>
                void setRating(
                  event.target.value === "" ? null : Number(event.target.value)
                )
              }
            >
              <option value="">{t("rating_none")}</option>
              {RATINGS.map((value) => (
                <option key={value} value={value}>
                  {value} / 10
                </option>
              ))}
            </select>
          </dd>
        </div>
        <div>
          <dt>{t("details_playtime", { ns: "library" })}</dt>
          <dd>
            {playTime > 0
              ? formatPlayTime(playTime)
              : t("details_never_played", { ns: "library" })}
          </dd>
        </div>
        <div>
          <dt>{t("details_last_played", { ns: "library" })}</dt>
          <dd>
            {shown.lastTimePlayed
              ? formatDistance(shown.lastTimePlayed, new Date(), {
                  addSuffix: true,
                })
              : t("details_never_played", { ns: "library" })}
          </dd>
        </div>
        {achievementCount > 0 && (
          <div>
            <dt>{t("details_achievements", { ns: "library" })}</dt>
            <dd>
              {unlocked} / {achievementCount}
              <progress
                className="your-stuff__progress"
                max={achievementCount}
                value={unlocked}
              />
            </dd>
          </div>
        )}
        {(installedVersion || availableUpdate) && (
          <div>
            <dt>{t("your_stuff_version")}</dt>
            <dd>
              {installedVersion
                ? describeRelease(installedVersion.title)
                : t("your_stuff_version_unknown")}
              {availableUpdate && (
                <Button
                  theme="outline"
                  className="your-stuff__update"
                  title={availableUpdate.release.title}
                  onClick={() =>
                    navigate(buildGameDetailsPath(shown, { update: "1" }))
                  }
                >
                  <SyncIcon size={14} />
                  {t("your_stuff_update_to", {
                    version: describeRelease(availableUpdate.release.title),
                  })}
                </Button>
              )}
            </dd>
          </div>
        )}
      </dl>

      {members.length > 1 && (
        <div className="your-stuff__list">
          <h3>{t("your_stuff_copies")}</h3>
          <ul>
            {members.map((member) => (
              <li key={member.id}>
                <span className="your-stuff__copy-source">
                  {copyLabel(member)}
                </span>
                <span className="your-stuff__copy-state">
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
        <div className="your-stuff__list">
          <h3>{t("your_stuff_related")}</h3>
          <ul className="your-stuff__related">
            {related.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="your-stuff__related-link"
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
    </section>
  );
}
