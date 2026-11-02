import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  SyncIcon,
} from "@primer/octicons-react";
import cn from "classnames";
import { StoreGameCardSkeleton } from "@renderer/components/store-game-card/store-game-card";
import "./store-shelf.scss";

const SKELETONS = 5;

export interface StoreShelfProps {
  title: string;
  subtitle?: string;
  onSeeAll?: () => void;
  isLoading: boolean;
  /** Shows the games already known and says that newer ones are on the way. */
  isRefreshing?: boolean;
  /** The shelf's cards, as `StoreGameCard size="shelf"`. */
  children: ReactNode;
}

/** A row of store cards: whole cards only, with buttons to page through them. */
export function StoreShelf({
  title,
  subtitle,
  onSeeAll,
  isLoading,
  isRefreshing = false,
  children,
}: Readonly<StoreShelfProps>) {
  const { t } = useTranslation("catalogue");
  const rowRef = useRef<HTMLDivElement>(null);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);

  const updateButtons = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    setCanScrollBack(row.scrollLeft > 1);
    setCanScrollForward(row.scrollLeft + row.clientWidth < row.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    updateButtons();
    const observer = new ResizeObserver(updateButtons);
    observer.observe(row);
    return () => observer.disconnect();
  }, [updateButtons, children, isLoading]);

  const scrollByPage = (direction: -1 | 1) => {
    const row = rowRef.current;
    if (!row) return;
    row.scrollBy({
      left: direction * row.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  return (
    <section className="store-shelf">
      <header className="store-shelf__header">
        <div className="store-shelf__heading">
          <h2 className="store-shelf__title">
            {title}
            {isRefreshing && (
              <SyncIcon
                size={14}
                className="store-shelf__refreshing"
                aria-label={t("ankergames_refreshing")}
              />
            )}
          </h2>
          {subtitle && <p className="store-shelf__subtitle">{subtitle}</p>}
        </div>
        {onSeeAll && (
          <button
            type="button"
            className="store-shelf__see-all"
            onClick={onSeeAll}
          >
            {t("see_all")}
          </button>
        )}
      </header>

      <div className="store-shelf__viewport">
        {canScrollBack && (
          <button
            type="button"
            className="store-shelf__nav store-shelf__nav--back"
            onClick={() => scrollByPage(-1)}
            aria-label={t("shelf_previous")}
          >
            <ChevronLeftIcon size={20} />
          </button>
        )}
        <div
          ref={rowRef}
          className={cn("store-shelf__row", {
            "store-shelf__row--loading": isLoading,
          })}
          onScroll={updateButtons}
        >
          {isLoading
            ? Array.from({ length: SKELETONS }, (_, index) => (
                <StoreGameCardSkeleton key={index} size="shelf" />
              ))
            : children}
        </div>
        {canScrollForward && (
          <button
            type="button"
            className="store-shelf__nav store-shelf__nav--forward"
            onClick={() => scrollByPage(1)}
            aria-label={t("shelf_next")}
          >
            <ChevronRightIcon size={20} />
          </button>
        )}
      </div>
    </section>
  );
}
