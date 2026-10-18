import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { SyncIcon } from "@primer/octicons-react";

import { Button } from "@renderer/components";
import { buildGameDetailsPath } from "@renderer/helpers";
import { useDate, useLibrary } from "@renderer/hooks";
import { formatReleaseVersion, parseReleaseVersion } from "@shared";
import type { LibraryGame } from "@types";

import "./game-updates-section.scss";

const describeRelease = (title: string) =>
  formatReleaseVersion(parseReleaseVersion(title)) ?? title;

export function GameUpdatesSection({
  library,
}: Readonly<{ library: LibraryGame[] }>) {
  const { t } = useTranslation("downloads");
  const navigate = useNavigate();
  const { formatDate } = useDate();
  const { updateLibrary } = useLibrary();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    window.electron.isCheckingGameUpdates().then(setChecking);
    return window.electron.onGameUpdatesChecking((value) => {
      setChecking(value);
      if (!value) updateLibrary();
    });
  }, [updateLibrary]);

  const games = useMemo(
    () =>
      library
        .filter((game) => game.availableUpdate && game.executablePath)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [library]
  );

  const handleCheck = async () => {
    setChecking(true);
    await window.electron.checkGameUpdates().finally(() => setChecking(false));
    updateLibrary();
  };

  const handleDismiss = async (game: LibraryGame) => {
    await window.electron.dismissGameUpdate(game.shop, game.objectId);
    updateLibrary();
  };

  return (
    <section className="game-updates">
      <div className="game-updates__header">
        <h2>{t("game_updates")}</h2>
        {games.length > 0 && (
          <span className="game-updates__count">{games.length}</span>
        )}
        <Button
          theme="outline"
          onClick={handleCheck}
          disabled={checking}
          className="game-updates__check"
        >
          <SyncIcon
            size={14}
            className={checking ? "game-updates__spinner" : undefined}
          />
          {checking ? t("checking_game_updates") : t("check_game_updates")}
        </Button>
      </div>

      {games.length === 0 ? (
        <p className="game-updates__muted">{t("no_game_updates")}</p>
      ) : (
        <ul className="game-updates__list">
          {games.map((game) => {
            const update = game.availableUpdate!.release;
            const installed = game.installedVersion;
            return (
              <li key={game.id} className="game-updates__item">
                {game.iconUrl ? (
                  <img
                    src={game.iconUrl}
                    alt=""
                    className="game-updates__icon"
                  />
                ) : (
                  <span className="game-updates__icon" />
                )}
                <div className="game-updates__details">
                  <strong>{game.title}</strong>
                  <span
                    className="game-updates__muted"
                    title={`${installed?.title ?? ""} → ${update.title}`}
                  >
                    {installed
                      ? t("game_update_versions", {
                          installed: describeRelease(installed.title),
                          available: describeRelease(update.title),
                        })
                      : describeRelease(update.title)}
                  </span>
                  <span className="game-updates__muted">
                    {[
                      update.downloadSourceName,
                      update.fileSize,
                      update.uploadDate ? formatDate(update.uploadDate) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <div className="game-updates__actions">
                  <Button theme="outline" onClick={() => handleDismiss(game)}>
                    {t("ignore_game_update")}
                  </Button>
                  <Button
                    onClick={() =>
                      navigate(buildGameDetailsPath(game, { update: "1" }))
                    }
                  >
                    {t("update_game")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
