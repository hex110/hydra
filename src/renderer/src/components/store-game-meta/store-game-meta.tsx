import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Skeleton from "react-loading-skeleton";
import { ClockIcon, DownloadIcon, StarFillIcon } from "@primer/octicons-react";
import cn from "classnames";
import {
  formatBytes,
  getRatingTone,
  getReviewLabel,
  getStoreRating,
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

/**
 * The Hydra rating: Steam's reviews adjusted for how many there are, with
 * Metacritic blended in when known. The tooltip lists the parts.
 */
export function StoreGameRatingChip({
  percent,
  count,
  criticScore,
}: Readonly<{
  percent?: number | null;
  count?: number | null;
  criticScore?: number | null;
}>) {
  const { t } = useTranslation("catalogue");
  const { formatNumber } = useFormat();

  const rating = getStoreRating({
    reviewPercent: percent,
    reviewCount: count,
    criticScore,
  });
  if (!rating) return null;

  const label = getReviewLabel(rating.reviewPercent, rating.reviewCount);
  const lines = [
    t("rating_tooltip_title", { value: Math.round(rating.value) }),
    rating.reviewPercent !== null &&
      t("rating_tooltip_steam", {
        percent: rating.reviewPercent,
        count: rating.reviewCount,
        formattedCount: formatNumber(rating.reviewCount),
        label: label ? t(`review_label_${label}`) : "",
      }),
    rating.critic !== null &&
      t("rating_tooltip_critic", { score: rating.critic }),
    t("rating_tooltip_explain"),
  ].filter(Boolean);

  return (
    <span
      className={cn(
        "store-game-meta__chip",
        `store-game-meta__chip--review-${getRatingTone(rating.value)}`
      )}
      title={lines.join("\n")}
    >
      <StarFillIcon size={10} />
      {Math.round(rating.value)}
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
 * Tags, then the Hydra rating, year, length and size. The two lines
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
        <StoreGameRatingChip
          percent={facts?.reviewPercent}
          count={facts?.reviewCount}
          criticScore={facts?.criticScore}
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
        {badge}
      </span>
    </div>
  );
}
