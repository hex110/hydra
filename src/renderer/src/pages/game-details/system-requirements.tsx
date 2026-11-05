import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { gameDetailsContext } from "@renderer/context";
import "./system-requirements.scss";

const LEVELS = ["minimum", "recommended"] as const;

/** Steam's own requirement lists, Minimum and Recommended side by side. */
export function SystemRequirements() {
  const { t } = useTranslation("game_details");
  const { shopDetails } = useContext(gameDetailsContext);

  const columns = LEVELS.flatMap((level) => {
    const html = shopDetails?.pc_requirements?.[level];
    return html ? [{ level, html }] : [];
  });

  if (columns.length === 0) return null;

  return (
    <section className="game-details__section system-requirements">
      <h2 className="game-details__section-title">{t("requirements")}</h2>

      <div className="system-requirements__columns">
        {columns.map(({ level, html }) => (
          <div
            key={level}
            className="system-requirements__details"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ))}
      </div>
    </section>
  );
}
