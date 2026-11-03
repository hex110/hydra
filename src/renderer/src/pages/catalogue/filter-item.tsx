import { XIcon } from "@primer/octicons-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "react-tooltip";
import "./filter.scss";

/** The kind of filter, which sets the chip's colour. */
export type FilterCategory =
  | "genres"
  | "tags"
  | "downloadSourceFingerprints"
  | "developers"
  | "publishers"
  | "protondbSupportBadges"
  | "deckCompatibility"
  | "releaseYear"
  | "platforms"
  | "excludeTags"
  | "players";

interface FilterItemProps {
  filter: string;
  filterType: string;
  category: FilterCategory;
  onRemove: () => void;
}

export function FilterItem({
  filter,
  filterType,
  category,
  onRemove,
}: FilterItemProps) {
  const { t } = useTranslation("catalogue");
  const tooltipId = useId();

  return (
    <div className={`filter-item filter-item--${category}`}>
      <div
        className="filter-item__orb"
        data-tooltip-id={tooltipId}
        data-tooltip-content={filterType}
        data-tooltip-place="top"
      />
      <span className="filter-item__label">{filter}</span>
      <button
        type="button"
        onClick={onRemove}
        className="filter-item__remove-button"
        aria-label={`${t("clear_filters", { filterCount: 1 })}: ${filter}`}
      >
        <XIcon size={13} aria-hidden="true" />
      </button>
      <Tooltip id={tooltipId} style={{ zIndex: 9999 }} />
    </div>
  );
}
