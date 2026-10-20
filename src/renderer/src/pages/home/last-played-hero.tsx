import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PlayIcon, XIcon } from "@primer/octicons-react";
import type { LibraryGamePresentation } from "@types";
import { getDisplayedPlayTimeInMilliseconds } from "@shared";
import { Button, useGameActions } from "@renderer/components";
import { useDate } from "@renderer/hooks";
import { buildGameDetailsPath, resolveImageSource } from "@renderer/helpers";
import "@renderer/components/hero/hero.scss";
import "./last-played-hero.scss";

interface LastPlayedHeroProps {
  game: LibraryGamePresentation;
}

/** The game you played last, with a button to start it again. */
export function LastPlayedHero({ game }: Readonly<LastPlayedHeroProps>) {
  const { t } = useTranslation("home");
  const navigate = useNavigate();
  const { formatDistance } = useDate();
  const { canPlay, isGameRunning, handlePlayGame, handleCloseGame } =
    useGameActions(game);

  const heroImage = resolveImageSource(
    game.customHeroImageUrl ?? game.libraryHeroImageUrl
  );
  const logo = resolveImageSource(game.customLogoImageUrl ?? game.logoImageUrl);
  const openGame = () => navigate(buildGameDetailsPath(game));
  const hours = Math.floor(
    getDisplayedPlayTimeInMilliseconds(game) / 3_600_000
  );

  return (
    <div
      role="link"
      tabIndex={0}
      className="hero last-played-hero"
      onClick={openGame}
      onKeyDown={(event) => {
        if (event.key === "Enter") openGame();
      }}
    >
      <div className="hero__backdrop">
        {heroImage && <img src={heroImage} alt="" className="hero__media" />}

        <div className="hero__content">
          <p className="last-played-hero__eyebrow">{t("continue_playing")}</p>
          {logo ? (
            <img src={logo} alt={game.title} className="hero__logo" />
          ) : (
            <h2 className="last-played-hero__title">{game.title}</h2>
          )}
          <p className="last-played-hero__details">
            {game.lastTimePlayed &&
              t("last_played_ago", {
                time: formatDistance(game.lastTimePlayed, new Date(), {
                  addSuffix: true,
                }),
              })}
            {hours > 0 && ` · ${t("hours_played", { count: hours })}`}
          </p>
          {(canPlay || isGameRunning) && (
            <div className="last-played-hero__actions">
              <Button
                theme="primary"
                onClick={(event) => {
                  event.stopPropagation();
                  void (isGameRunning ? handleCloseGame() : handlePlayGame());
                }}
              >
                {isGameRunning ? <XIcon /> : <PlayIcon />}
                {isGameRunning ? t("close_game") : t("play")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
