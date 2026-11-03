import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import List from "rc-virtual-list";

import { CheckboxField } from "@renderer/components/checkbox-field/checkbox-field";
import { SidebarSection } from "@renderer/components/sidebar-section/sidebar-section";
import { TextField } from "@renderer/components/text-field/text-field";
import { useFormat } from "@renderer/hooks";
import "./filter.scss";

/** The filter box shows once a list is longer than this. */
const SEARCH_FROM = 10;
const ROW_HEIGHT = 28;
const VISIBLE_ROWS = 10;

export interface FilterSectionItem {
  label: string;
  value: string | number;
  checked: boolean;
  group?: string;
  /** Games in the catalogue with it; shown in grey after the label. */
  count?: number | null;
  /** Where it sits when the list is ordered by facet: selected, from your library, or the rest. */
  facetGroup?: "selected" | "library" | "rest";
}

export interface FilterSectionProps {
  title: string;
  items: FilterSectionItem[];
  groups?: readonly {
    label: string;
    value: string;
  }[];
  onSelect: (value: string | number) => void;
  onClear: () => void;
  /** Open when first shown; sections with a selection are open regardless. */
  defaultOpen?: boolean;
  /** Says what the grey counts are. */
  countHint?: string;
}

export function FilterSection({
  title,
  items,
  groups,
  onSelect,
  onClear,
  defaultOpen = false,
  countHint,
}: FilterSectionProps) {
  const { t } = useTranslation("catalogue");
  const { formatNumber } = useFormat();
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const availableGroups = useMemo(
    () =>
      (groups ?? []).filter((group) =>
        items.some((item) => item.group === group.value)
      ),
    [groups, items]
  );

  const activeGroup = useMemo(() => {
    if (
      selectedGroup &&
      availableGroups.some((group) => group.value === selectedGroup)
    ) {
      return selectedGroup;
    }

    return (
      availableGroups.find((group) =>
        items.some((item) => item.checked && item.group === group.value)
      )?.value ??
      availableGroups[0]?.value ??
      null
    );
  }, [availableGroups, items, selectedGroup]);

  const visibleItems = useMemo(
    () =>
      activeGroup ? items.filter((item) => item.group === activeGroup) : items,
    [activeGroup, items]
  );

  const selectedItemsCount = items.filter((item) => item.checked).length;

  const pinnedSelected = visibleItems.filter(
    (item) => item.facetGroup === "selected"
  );
  const fromLibrary = visibleItems.filter(
    (item) => item.facetGroup === "library"
  );
  const rest = useMemo(() => {
    const others = visibleItems.filter(
      (item) => item.facetGroup !== "selected" && item.facetGroup !== "library"
    );
    const needle = search.trim().toLowerCase();
    return needle
      ? others.filter((item) => item.label.toLowerCase().includes(needle))
      : others;
  }, [visibleItems, search]);
  const restCount = visibleItems.filter(
    (item) => item.facetGroup !== "selected" && item.facetGroup !== "library"
  ).length;

  if (!items.length) return null;

  const renderItem = (item: FilterSectionItem) => (
    <div key={item.value} className="filter-section__item">
      <CheckboxField
        label={
          <>
            {item.label}
            {typeof item.count === "number" && (
              <span className="filter-section__count-hint">
                ({formatNumber(item.count)})
              </span>
            )}
          </>
        }
        checked={item.checked}
        onChange={() => onSelect(item.value)}
      />
    </div>
  );

  return (
    <SidebarSection
      title={title}
      defaultOpen={defaultOpen || selectedItemsCount > 0}
    >
      <div className="filter-section__body" title={countHint}>
        {selectedItemsCount > 0 && (
          <button
            type="button"
            className="filter-section__clear-button"
            onClick={onClear}
          >
            {t("clear_filters", {
              filterCount: formatNumber(selectedItemsCount),
            })}
          </button>
        )}

        {availableGroups.length > 1 && (
          <div
            className="filter-section__group-tabs"
            role="tablist"
            aria-label={title}
          >
            {availableGroups.map((group) => {
              const selectedInGroup = items.filter(
                (item) => item.checked && item.group === group.value
              ).length;

              return (
                <button
                  key={group.value}
                  type="button"
                  role="tab"
                  aria-selected={activeGroup === group.value}
                  className={`filter-section__group-tab ${
                    activeGroup === group.value
                      ? "filter-section__group-tab--active"
                      : ""
                  }`}
                  onClick={() => {
                    setSelectedGroup(group.value);
                    setSearch("");
                  }}
                >
                  <span>{group.label}</span>
                  {selectedInGroup > 0 && (
                    <span className="filter-section__group-tab-count">
                      {formatNumber(selectedInGroup)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {pinnedSelected.length > 0 && (
          <div className="filter-section__block">
            {pinnedSelected.map(renderItem)}
          </div>
        )}

        {fromLibrary.length > 0 && (
          <>
            <span className="filter-section__label">
              {t("from_your_library")}
            </span>
            <div className="filter-section__block">
              {fromLibrary.map(renderItem)}
            </div>
          </>
        )}

        {restCount > SEARCH_FROM && (
          <TextField
            placeholder={t("search")}
            onChange={(event) => setSearch(event.target.value)}
            value={search}
            theme="dark"
          />
        )}

        {rest.length > 0 && (
          <List
            data={rest}
            height={ROW_HEIGHT * Math.min(rest.length, VISIBLE_ROWS)}
            itemHeight={ROW_HEIGHT}
            itemKey="value"
            styles={{
              verticalScrollBar: {
                backgroundColor: "rgba(255, 255, 255, 0.03)",
              },
              verticalScrollBarThumb: {
                backgroundColor: "rgba(255, 255, 255, 0.08)",
                borderRadius: "24px",
              },
            }}
          >
            {renderItem}
          </List>
        )}
      </div>
    </SidebarSection>
  );
}
