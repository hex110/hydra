import { useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { gameDetailsContext } from "@renderer/context/game-details/game-details.context";
import "./game-languages.scss";

/** Steam marks languages with voice-over by an asterisk after the name. */
export function GameLanguages() {
  const { t } = useTranslation("game_details");
  const { shopDetails } = useContext(gameDetailsContext);

  const { all, withAudio } = useMemo(() => {
    const supported = shopDetails?.supported_languages?.split("<br>")[0];
    const languages = (supported?.split(",") ?? [])
      .map((language) => ({
        name: language.replace("<strong>*</strong>", "").trim(),
        hasAudio: language.includes("*"),
      }))
      .filter((language) => language.name);

    return {
      all: languages.map((language) => language.name),
      withAudio: languages
        .filter((language) => language.hasAudio)
        .map((language) => language.name),
    };
  }, [shopDetails?.supported_languages]);

  if (all.length === 0) return null;

  return (
    <section className="game-details__section game-languages">
      <h2 className="game-details__section-title">{t("language")}</h2>

      <dl className="game-languages__list">
        <div className="game-languages__row">
          <dt>{t("caption")}</dt>
          <dd>{all.join(", ")}</dd>
        </div>

        {withAudio.length > 0 && (
          <div className="game-languages__row">
            <dt>{t("audio")}</dt>
            <dd>{withAudio.join(", ")}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
