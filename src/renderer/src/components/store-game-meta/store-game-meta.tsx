import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Skeleton from "react-loading-skeleton";
import { ClockIcon, DownloadIcon } from "@primer/octicons-react";
import cn from "classnames";
import {
  formatBytes,
  getCriticScoreTone,
  getReviewLabel,
  getReviewTone,
  type StoreGameFacts,
} from "@shared";
import { useFormat } from "@renderer/hooks/use-format";
import { useSteamTagLabels } from "@renderer/pages/catalogue/use-steam-tag-labels";
import "./store-game-meta.scss";

const META_TAGS = 3;
const NO_TAGS: string[] = [];

/** A muted chip for a meta line, e.g. an AnkerGames version. */
export function StoreGameChip({
  children,
  title,
}: Readonly<{ children: ReactNode; title?: string }>) {
  return (
    <span className="store-game-meta__chip" title={title}>
      {children}
    </span>
  );
}

/** Steam's share of positive reviews, toned as Steam tones it; nothing under ten reviews. */
export function StoreGameReviewChip({
  percent,
  count,
}: Readonly<{ percent?: number | null; count?: number | null }>) {
  const { t } = useTranslation("catalogue");
  const { formatNumber } = useFormat();

  const tone = getReviewTone(percent, count);
  const label = getReviewLabel(percent, count);
  if (!tone || !label || percent == null) return null;

  return (
    <span
      className={cn(
        "store-game-meta__chip",
        `store-game-meta__chip--review-${tone}`
      )}
      title={t("review_summary", {
        label: t(`review_label_${label}`),
        count: count ?? 0,
        formattedCount: formatNumber(count ?? 0),
      })}
    >
      {percent}%
    </span>
  );
}

export interface StoreGameMetaProps {
  facts?: StoreGameFacts;
  /** Facts are on their way; shows a skeleton until they arrive. */
  pending?: boolean;
  /** Known before the facts arrive, e.g. from a search result. */
  releaseYear?: number | null;
  /** Shown while the game has no tags, e.g. the catalogue's genres. */
  fallbackTags?: string[];
  /** A chip of the caller's own, e.g. an AnkerGames version. */
  badge?: ReactNode;
}

/**
 * Tags, then review score, year, length, size and Metacritic. The two lines
 * keep their height whether or not there is anything to show, so cards don't
 * jump when the facts arrive.
 */
export function StoreGameMeta({
  facts,
  pending = false,
  releaseYear,
  fallbackTags = NO_TAGS,
  badge,
}: Readonly<StoreGameMetaProps>) {
  const { t } = useTranslation("catalogue");
  const tagLabels = useSteamTagLabels();

  const tags = useMemo(() => {
    const names = (facts?.tagIds ?? []).flatMap(
      (id) => tagLabels.get(id) ?? []
    );
    return (names.length > 0 ? names : fallbackTags).slice(0, META_TAGS);
  }, [facts?.tagIds, tagLabels, fallbackTags]);

  if (pending && !facts) {
    return (
      <div className="store-game-meta store-game-meta--pending" aria-hidden>
        <Skeleton width="80%" height={12} />
        <Skeleton width="55%" height={14} />
      </div>
    );
  }

  const year = facts?.releaseYear ?? releaseYear ?? null;

  return (
    <div className="store-game-meta">
      <span className="store-game-meta__tags">{tags.join(", ")}</span>
      <span className="store-game-meta__chips">
        <StoreGameReviewChip
          percent={facts?.reviewPercent}
          count={facts?.reviewCount}
        />
        {year !== null && <span className="store-game-meta__chip">{year}</span>}
        {facts?.howLongToBeatHours != null && (
          <span
            className="store-game-meta__chip"
            title={t("how_long_to_beat_main")}
          >
            <ClockIcon size={12} />
            {t("hours_short", { hours: Math.round(facts.howLongToBeatHours) })}
          </span>
        )}
        {facts?.downloadSize != null && (
          <span className="store-game-meta__chip" title={t("download_size")}>
            <DownloadIcon size={12} />
            {formatBytes(facts.downloadSize)}
          </span>
        )}
        {facts?.criticScore != null && (
          <span
            className={cn(
              "store-game-meta__chip",
              "store-game-meta__chip--critic",
              `store-game-meta__chip--critic-${getCriticScoreTone(facts.criticScore)}`
            )}
            title={t("metacritic_score")}
          >
            {facts.criticScore}
          </span>
        )}
        {badge}
      </span>
    </div>
  );
}
