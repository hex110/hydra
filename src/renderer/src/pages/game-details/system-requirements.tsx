import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { compareSpecs } from "@shared";
import type { RequirementTier, ResolvedSpecs, TierVerdict } from "@types";

import { Link } from "@renderer/components";
import { gameDetailsContext } from "@renderer/context";
import { useSystemSpecs } from "@renderer/hooks";

import "./system-requirements.scss";

const LEVELS: RequirementTier[] = ["minimum", "recommended"];

function RequirementsVerdict({
  verdict,
  specs,
}: Readonly<{ verdict: TierVerdict; specs: ResolvedSpecs }>) {
  const { t } = useTranslation("game_details");

  if (verdict.checks.length === 0) return null;

  const parts = (status: "below" | "unknown") =>
    verdict.checks
      .filter((check) => check.status === status)
      .map((check) => t(`requirements_part_${check.component}`))
      .join(", ");

  const gpuBelowOnAGuess =
    specs.gpuAmbiguous &&
    verdict.checks.some(
      (check) => check.component === "gpu" && check.status === "below"
    );

  const message = {
    meets: t("requirements_meets"),
    below: t("requirements_below", { parts: parts("below") }),
    partial: t("requirements_partial", { parts: parts("unknown") }),
    unknown: t("requirements_unknown"),
  }[verdict.status];

  return (
    <p
      className={`system-requirements__verdict system-requirements__verdict--${verdict.status}`}
    >
      {message}
      {gpuBelowOnAGuess && ` ${t("requirements_gpu_guess")}`}{" "}
      <Link to="/settings?tab=my_pc">{t("requirements_my_pc")}</Link>
    </p>
  );
}

/** Steam's own requirement lists, Minimum and Recommended side by side, each checked against the user's PC. */
export function SystemRequirements() {
  const { t } = useTranslation("game_details");
  const { shopDetails } = useContext(gameDetailsContext);
  const { loading, specs } = useSystemSpecs();

  const columns = LEVELS.flatMap((level) => {
    const html = shopDetails?.pc_requirements?.[level];
    return html ? [{ level, html }] : [];
  });

  if (columns.length === 0) return null;

  const knowsPc = !!(specs.cpuId || specs.gpuId || specs.ramGb);

  return (
    <section className="game-details__section system-requirements">
      <h2 className="game-details__section-title">{t("requirements")}</h2>

      <div className="system-requirements__columns">
        {columns.map(({ level, html }) => (
          <div key={level} className="system-requirements__column">
            {!loading &&
              (knowsPc ? (
                <RequirementsVerdict
                  verdict={compareSpecs(specs, html, level)}
                  specs={specs}
                />
              ) : (
                <p className="system-requirements__verdict system-requirements__verdict--unknown">
                  {t("requirements_set_up")}{" "}
                  <Link to="/settings?tab=my_pc">
                    {t("requirements_my_pc")}
                  </Link>
                </p>
              ))}
            <div
              className="system-requirements__details"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
