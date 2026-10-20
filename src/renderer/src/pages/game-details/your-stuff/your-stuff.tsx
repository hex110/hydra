import { useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { SyncIcon } from "@primer/octicons-react";
import type { LibraryGame, PlayStatus } from "@types";
import {
  applyLibraryGroupAction,
  formatReleaseVersion,
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
import { findRelatedLibraryGames } from "./related-library-games";
import "./your-stuff.scss";

const COPY_SOURCES = ["steam", "epic", "classics", "local"] as const;

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

  if (!game || !shown || game.isDeleted) return null;

  const playTime = getDisplayedPlayTimeInMilliseconds(shown);
  const achievementGame = presentation?.achievementGame ?? shown;
  const unlocked = achievementGame.unlockedAchievementCount ?? 0;
  const achievementCount = Math.max(
    achievementGame.achievementCount ?? 0,
    unlocked
  );
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

      <dl className="your-stuff__stats">
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

      <GameNotesField game={presentation ?? game} />
    </section>
  );
}
