import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LinkExternalIcon, PlayIcon, XIcon } from "@primer/octicons-react";
import type { LibraryGame, PlayStatus } from "@types";
import {
  applyLibraryGroupAction,
  formatBytes,
  getDisplayedPlayTimeInMilliseconds,
} from "@shared";
import {
  Button,
  ConfirmationModal,
  useGameActions,
} from "@renderer/components";
import { buildGameDetailsPath, isGameReadyToPlay } from "@renderer/helpers";
import { useDate, useGameCard, useLibrary, useToast } from "@renderer/hooks";
import { PlayStatusMenu } from "@renderer/pages/game-details/hero/play-status-menu";
import { getGameGenres } from "./library-filters";
import { GameNotesField } from "./game-notes-field";
import "./library-details-pane.scss";

type PaneGame = LibraryGame & { members?: LibraryGame[] };

interface LibraryDetailsPaneProps {
  game: PaneGame;
  onClose: () => void;
}

const noop = () => {};

/** The selected game next to the grid, as in Playnite. */
export function LibraryDetailsPane({
  game,
  onClose,
}: Readonly<LibraryDetailsPaneProps>) {
  const { t } = useTranslation(["library", "game_details"]);
  const navigate = useNavigate();
  const { formatDistance } = useDate();
  const { formatPlayTime } = useGameCard(game, noop);
  const { updateLibrary } = useLibrary();
  const { showErrorToast } = useToast();
  const {
    isGameRunning,
    handlePlayGame,
    handleCloseGame,
    rpcs3ConfirmPending,
    handleConfirmRpcs3Launch,
    handleCancelRpcs3Launch,
  } = useGameActions(game);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [game.id]);

  const members = game.members?.length ? game.members : [game];
  const installed = isGameReadyToPlay(game);
  const playTime = getDisplayedPlayTimeInMilliseconds(game);
  const genres = getGameGenres(game);
  const mainStory = game.metadata?.howLongToBeat?.mainStory ?? null;
  const achievementCount = Math.max(
    game.achievementCount ?? 0,
    game.unlockedAchievementCount ?? 0
  );
  const image =
    game.customHeroImageUrl ||
    game.libraryHeroImageUrl ||
    game.customCoverImageUrl ||
    game.coverImageUrl ||
    game.libraryImageUrl;

  const setPlayStatus = async (playStatus: PlayStatus | null) => {
    try {
      await applyLibraryGroupAction(members, (member) =>
        window.electron.setGamePlayStatus(
          member.shop,
          member.objectId,
          playStatus
        )
      );
      await updateLibrary();
    } catch {
      showErrorToast(t("failed_update_play_status", { ns: "game_details" }));
    }
  };

  const rows: { label: string; value: string }[] = [
    {
      label: t("details_playtime"),
      value:
        playTime > 0 ? formatPlayTime(playTime) : t("details_never_played"),
    },
    ...(game.lastTimePlayed
      ? [
          {
            label: t("details_last_played"),
            value: formatDistance(game.lastTimePlayed, new Date(), {
              addSuffix: true,
            }),
          },
        ]
      : []),
    ...(achievementCount > 0
      ? [
          {
            label: t("details_achievements"),
            value: `${game.unlockedAchievementCount ?? 0} / ${achievementCount}`,
          },
        ]
      : []),
    ...(mainStory
      ? [
          {
            label: t("details_main_story"),
            value: t("amount_hours_short", { amount: Math.round(mainStory) }),
          },
        ]
      : []),
    ...(game.installedSizeInBytes
      ? [
          {
            label: t("details_size"),
            value: formatBytes(game.installedSizeInBytes),
          },
        ]
      : []),
    ...(genres.length > 0
      ? [{ label: t("details_genres"), value: genres.join(", ") }]
      : []),
  ];

  return (
    <aside className="library-details-pane" aria-label={game.title}>
      <button
        type="button"
        className="library-details-pane__close"
        onClick={onClose}
        title={t("details_pane_close")}
        aria-label={t("details_pane_close")}
      >
        <XIcon size={16} />
      </button>

      <div className="library-details-pane__media">
        {image && !imageFailed ? (
          <img src={image} alt="" onError={() => setImageFailed(true)} />
        ) : (
          <div className="library-details-pane__media-placeholder" />
        )}
      </div>

      <div className="library-details-pane__body">
        <h2 className="library-details-pane__title">{game.title}</h2>

        <div className="library-details-pane__actions">
          <Button
            onClick={() =>
              void (isGameRunning ? handleCloseGame() : handlePlayGame())
            }
          >
            {isGameRunning ? <XIcon /> : <PlayIcon />}
            {isGameRunning
              ? t("close", { ns: "game_details" })
              : installed
                ? t("play", { ns: "game_details" })
                : t("download", { ns: "game_details" })}
          </Button>
          <Button
            theme="outline"
            onClick={() =>
              navigate(buildGameDetailsPath({ ...game, ...game.catalogueGame }))
            }
          >
            <LinkExternalIcon />
            {t("details_open_page")}
          </Button>
        </div>

        <PlayStatusMenu
          playStatus={game.playStatus ?? null}
          onChange={(playStatus) => void setPlayStatus(playStatus)}
        />

        <dl className="library-details-pane__rows">
          {rows.map((row) => (
            <div key={row.label} className="library-details-pane__row">
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>

        <GameNotesField game={game} />
      </div>

      <ConfirmationModal
        visible={rpcs3ConfirmPending !== null}
        title={t("rpcs3_already_running_title", { ns: "game_details" })}
        descriptionText={t("rpcs3_already_running_description", {
          ns: "game_details",
        })}
        confirmButtonLabel={t("rpcs3_already_running_confirm", {
          ns: "game_details",
        })}
        cancelButtonLabel={t("cancel", { ns: "game_details" })}
        onClose={handleCancelRpcs3Launch}
        onConfirm={handleConfirmRpcs3Launch}
      />
    </aside>
  );
}
