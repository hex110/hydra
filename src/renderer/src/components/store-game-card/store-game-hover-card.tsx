import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import cn from "classnames";
import { getRatingTone, getReviewLabel, type StoreGameFacts } from "@shared";
import { useFormat } from "@renderer/hooks/use-format";
import { useSteamTagLabels } from "@renderer/pages/catalogue/use-steam-tag-labels";
import "./store-game-hover-card.scss";

const GAP = 12;
const MARGIN = 8;
const HOVER_CARD_TAGS = 4;
const NO_TAGS: string[] = [];

/**
 * A small card beside a store game, as Steam's: its short description, the
 * Steam reviews and the first few tags. Rendered in the body, so a shelf's
 * overflow can't clip it; it opens on the right of the game and on the left
 * when there is no room.
 */
export function StoreGameHoverCard({
  anchor,
  title,
  facts,
  fallbackTags = NO_TAGS,
}: Readonly<{
  anchor: HTMLElement | null;
  title: string;
  facts?: StoreGameFacts;
  fallbackTags?: string[];
}>) {
  const { t } = useTranslation("catalogue");
  const { formatNumber } = useFormat();
  const tagLabels = useSteamTagLabels();
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>();

  const tags = useMemo(() => {
    const names = (facts?.tagIds ?? []).flatMap(
      (id) => tagLabels.get(id) ?? []
    );
    return (names.length > 0 ? names : fallbackTags).slice(0, HOVER_CARD_TAGS);
  }, [facts?.tagIds, tagLabels, fallbackTags]);

  useLayoutEffect(() => {
    const card = ref.current;
    if (!anchor || !card) return;

    const rect = anchor.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = card;
    const fitsRight = rect.right + GAP + width + MARGIN <= window.innerWidth;
    const left = fitsRight
      ? rect.right + GAP
      : Math.max(MARGIN, rect.left - GAP - width);
    const top = Math.min(
      Math.max(MARGIN, rect.top),
      Math.max(MARGIN, window.innerHeight - height - MARGIN)
    );
    setPosition({ left, top });
  }, [anchor, facts, tags]);

  const percent = facts?.reviewPercent ?? null;
  const count = facts?.reviewCount ?? null;
  const label = getReviewLabel(percent, count);
  const hasContent = Boolean(facts?.description) || count !== null;
  if (!anchor || !facts || (!hasContent && tags.length === 0)) return null;

  return createPortal(
    <div
      ref={ref}
      className={cn(
        "store-game-hover-card",
        position && "store-game-hover-card--placed"
      )}
      style={position}
      role="tooltip"
    >
      <strong className="store-game-hover-card__title">{title}</strong>
      {facts.description && (
        <p className="store-game-hover-card__description">
          {facts.description}
        </p>
      )}
      {count !== null && percent !== null && (
        <div className="store-game-hover-card__reviews">
          <span className="store-game-hover-card__reviews-label">
            {t("hover_card_reviews")}
          </span>
          {label ? (
            <>
              <span
                className={cn(
                  "store-game-hover-card__verdict",
                  `store-game-hover-card__verdict--${getRatingTone(percent)}`
                )}
              >
                {t(`review_label_${label}`)}
              </span>
              <span className="store-game-hover-card__reviews-detail">
                {t("hover_card_reviews_detail", {
                  count,
                  percent,
                  formattedCount: formatNumber(count),
                })}
              </span>
            </>
          ) : (
            <span className="store-game-hover-card__reviews-detail">
              {t("hover_card_few_reviews")}
            </span>
          )}
        </div>
      )}
      {tags.length > 0 && (
        <ul className="store-game-hover-card__tags">
          {tags.map((tag) => (
            <li key={tag} className="store-game-hover-card__tag">
              {tag}
            </li>
          ))}
        </ul>
      )}
    </div>,
    document.body
  );
}
