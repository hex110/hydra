import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import cn from "classnames";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import type { GameReception } from "@shared";
import { Link } from "@renderer/components/link/link";
import { useFormat } from "@renderer/hooks";
import { SidebarSection } from "../sidebar-section/sidebar-section";
import "./reception-section.scss";

export interface ReceptionSectionProps {
  steamAppId: string | null;
}

const POSITIVE_FROM_PERCENT = 70;
const MIXED_FROM_PERCENT = 40;

const sentiment = (percent: number) => {
  if (percent >= POSITIVE_FROM_PERCENT) return "positive";
  if (percent >= MIXED_FROM_PERCENT) return "mixed";
  return "negative";
};

/** How other people rate and play the game, from Steam. */
export function ReceptionSection({
  steamAppId,
}: Readonly<ReceptionSectionProps>) {
  const { t } = useTranslation("game_details");
  const { numberFormatter } = useFormat();
  const [state, setState] = useState<{
    isLoading: boolean;
    data: GameReception | null;
  }>({ isLoading: true, data: null });

  useEffect(() => {
    if (!steamAppId) return;

    let cancelled = false;
    setState({ isLoading: true, data: null });

    window.electron
      .getGameReception(steamAppId)
      .then((data) => {
        if (!cancelled) setState({ isLoading: false, data });
      })
      .catch(() => {
        if (!cancelled) setState({ isLoading: false, data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [steamAppId]);

  if (!steamAppId) return null;

  const { reviews, currentPlayers, metacritic } = state.data ?? {};
  const hasData = Boolean(reviews) || currentPlayers != null || !!metacritic;
  if (!state.isLoading && !hasData) return null;

  const reviewLabel = reviews
    ? t(
        `reception_review_${reviews.label.toLowerCase().replace(/\s+/g, "_")}`,
        { defaultValue: reviews.label }
      )
    : null;

  return (
    <SkeletonTheme baseColor="#1c1c1c" highlightColor="#444">
      <SidebarSection
        title={t("reception")}
        subtitle="Steam"
        subtitleHref={`https://store.steampowered.com/app/${steamAppId}#app_reviews_hash`}
      >
        {state.isLoading ? (
          <div className="reception">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="reception__skeleton" />
            ))}
          </div>
        ) : (
          <dl className="reception">
            {reviews && (
              <div className="reception__row">
                <dt>{t("reception_steam_reviews")}</dt>
                <dd>
                  <span
                    className={cn(
                      "reception__score",
                      `reception__score--${sentiment(reviews.percentPositive)}`
                    )}
                  >
                    {reviewLabel} · {reviews.percentPositive}%
                  </span>
                  <small>
                    {t("reception_review_count", {
                      count: reviews.totalReviews,
                      countFormatted: numberFormatter.format(
                        reviews.totalReviews
                      ),
                    })}
                  </small>
                </dd>
              </div>
            )}

            {currentPlayers != null && (
              <div className="reception__row">
                <dt>{t("reception_players_now")}</dt>
                <dd>{numberFormatter.format(currentPlayers)}</dd>
              </div>
            )}

            {metacritic && (
              <div className="reception__row">
                <dt>{t("reception_metacritic")}</dt>
                <dd>
                  {metacritic.url ? (
                    <Link to={metacritic.url}>{metacritic.score}</Link>
                  ) : (
                    metacritic.score
                  )}
                </dd>
              </div>
            )}
          </dl>
        )}
      </SidebarSection>
    </SkeletonTheme>
  );
}
