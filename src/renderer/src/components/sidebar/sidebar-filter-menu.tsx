import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import {
  CheckIcon,
  ClockIcon,
  FilterIcon,
  HeartIcon,
  HourglassIcon,
  PlusCircleIcon,
  SlidersIcon,
  SortDescIcon,
  TrophyIcon,
} from "@primer/octicons-react";
import { useId, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "react-tooltip";
import {
  TAB_ICONS,
  TAB_LABEL_KEYS,
} from "@renderer/pages/library/category-filter";
import type { LibraryTab } from "@renderer/pages/library/library-filters";
import type { SortOption } from "@renderer/pages/library/filter-options";
import "./sidebar-filter-menu.scss";

const MENU_SIDE_OFFSET = 8;
const MENU_COLLISION_PADDING = 16;

interface SidebarFilterMenuProps {
  tab: LibraryTab;
  tabs: LibraryTab[];
  onTabChange: (tab: LibraryTab) => void;
  sortBy: SortOption;
  onSortChange: (sortBy: SortOption) => void;
  showFavoritesFirst: boolean;
  onToggleFavoritesFirst: (next: boolean) => void;
  showPlatforms: boolean;
  platforms: string[];
  selectedPlatforms: string[];
  onPlatformsChange: (platforms: string[]) => void;
  /** Values selected in the library's Filters menu, which the list follows. */
  libraryFilterCount: number;
  onClearLibraryFilters: () => void;
}

interface FilterGroupOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

interface FilterGroupProps {
  label: string;
  allLabel: string;
  options: FilterGroupOption[];
  selected: string[];
  singleSelect?: boolean;
  onChange: (selected: string[]) => void;
}

function FilterGroup({
  label,
  allLabel,
  options,
  selected,
  singleSelect = false,
  onChange,
}: Readonly<FilterGroupProps>) {
  const handleToggle = (value: string, checked: boolean) => {
    if (singleSelect) {
      onChange([value]);
      return;
    }

    if (checked) {
      if (selected.includes(value)) return;
      onChange([...selected, value]);
      return;
    }

    if (selected.length <= 1) {
      onChange([]);
      return;
    }

    onChange(selected.filter((item) => item !== value));
  };

  return (
    <DropdownMenuPrimitive.Group className="sidebar-filter-menu__group">
      <DropdownMenuPrimitive.Label className="sidebar-filter-menu__label">
        {label}
      </DropdownMenuPrimitive.Label>

      <DropdownMenuPrimitive.CheckboxItem
        checked={selected.length === 0}
        onCheckedChange={(checked) => {
          if (checked === true) onChange([]);
        }}
        onSelect={(event) => event.preventDefault()}
        className="sidebar-filter-menu__item"
      >
        <span className="sidebar-filter-menu__item-label">{allLabel}</span>
        <DropdownMenuPrimitive.ItemIndicator
          forceMount
          className="sidebar-filter-menu__item-indicator"
        >
          <CheckIcon size={14} />
        </DropdownMenuPrimitive.ItemIndicator>
      </DropdownMenuPrimitive.CheckboxItem>

      {options.map((option) => (
        <DropdownMenuPrimitive.CheckboxItem
          key={option.value}
          checked={selected.includes(option.value)}
          onCheckedChange={(checked) =>
            handleToggle(option.value, checked === true)
          }
          onSelect={(event) => event.preventDefault()}
          className="sidebar-filter-menu__item"
        >
          {option.icon}
          <span className="sidebar-filter-menu__item-label">
            {option.label}
          </span>
          <DropdownMenuPrimitive.ItemIndicator
            forceMount
            className="sidebar-filter-menu__item-indicator"
          >
            <CheckIcon size={14} />
          </DropdownMenuPrimitive.ItemIndicator>
        </DropdownMenuPrimitive.CheckboxItem>
      ))}
    </DropdownMenuPrimitive.Group>
  );
}

export function SidebarFilterMenu({
  tab,
  tabs,
  onTabChange,
  sortBy,
  onSortChange,
  showFavoritesFirst,
  onToggleFavoritesFirst,
  showPlatforms,
  platforms,
  selectedPlatforms,
  onPlatformsChange,
  libraryFilterCount,
  onClearLibraryFilters,
}: Readonly<SidebarFilterMenuProps>) {
  const { t } = useTranslation(["sidebar", "library"]);

  const tooltipId = useId();
  const pointerInteractionRef = useRef(false);

  const sortOptions: {
    value: SortOption;
    label: string;
    icon: JSX.Element;
  }[] = [
    {
      value: "title_asc",
      label: t("sort_title", { ns: "library" }),
      icon: <SortDescIcon size={14} />,
    },
    {
      value: "recently_added",
      label: t("sort_recently_added", { ns: "library" }),
      icon: <PlusCircleIcon size={14} />,
    },
    {
      value: "recently_played",
      label: t("recently_played", { ns: "library" }),
      icon: <ClockIcon size={14} />,
    },
    {
      value: "most_played",
      label: t("sort_most_played", { ns: "library" }),
      icon: <HourglassIcon size={14} />,
    },
    {
      value: "achievements",
      label: t("sort_achievements", { ns: "library" }),
      icon: <TrophyIcon size={14} />,
    },
  ];

  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <button
          type="button"
          className="sidebar__add-button sidebar-filter-menu__trigger"
          aria-label={t("filter_sort_tooltip")}
          data-tooltip-id={tooltipId}
          data-tooltip-content={t("filter_sort_tooltip")}
          data-tooltip-place="top"
          onPointerDown={() => {
            pointerInteractionRef.current = true;
          }}
        >
          <SlidersIcon size={16} />
        </button>
      </DropdownMenuPrimitive.Trigger>

      <Tooltip id={tooltipId} place="top" />

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          side="right"
          align="start"
          sideOffset={MENU_SIDE_OFFSET}
          collisionPadding={MENU_COLLISION_PADDING}
          className="sidebar-filter-menu__content"
          onCloseAutoFocus={(event) => {
            if (pointerInteractionRef.current) {
              event.preventDefault();
            }
            pointerInteractionRef.current = false;
          }}
        >
          <div className="sidebar-filter-menu__column">
            <DropdownMenuPrimitive.Group className="sidebar-filter-menu__group">
              <DropdownMenuPrimitive.Label className="sidebar-filter-menu__label">
                {t("platforms_label")}
              </DropdownMenuPrimitive.Label>

              <DropdownMenuPrimitive.RadioGroup
                value={tab}
                onValueChange={(value) => onTabChange(value as LibraryTab)}
              >
                {tabs.map((option) => (
                  <DropdownMenuPrimitive.RadioItem
                    key={option}
                    value={option}
                    onSelect={(event) => event.preventDefault()}
                    className="sidebar-filter-menu__item"
                  >
                    {TAB_ICONS[option]}
                    <span>{t(TAB_LABEL_KEYS[option], { ns: "library" })}</span>
                    <DropdownMenuPrimitive.ItemIndicator
                      forceMount
                      className="sidebar-filter-menu__item-indicator"
                    >
                      <CheckIcon size={14} />
                    </DropdownMenuPrimitive.ItemIndicator>
                  </DropdownMenuPrimitive.RadioItem>
                ))}
              </DropdownMenuPrimitive.RadioGroup>
            </DropdownMenuPrimitive.Group>

            {libraryFilterCount > 0 && (
              <DropdownMenuPrimitive.Item
                className="sidebar-filter-menu__item"
                onSelect={onClearLibraryFilters}
              >
                <FilterIcon size={14} />
                <span>
                  {t("library_filters_applied", {
                    ns: "library",
                    count: libraryFilterCount,
                  })}
                </span>
              </DropdownMenuPrimitive.Item>
            )}

            <DropdownMenuPrimitive.Separator className="sidebar-filter-menu__separator" />

            <DropdownMenuPrimitive.Group className="sidebar-filter-menu__group">
              <DropdownMenuPrimitive.Label className="sidebar-filter-menu__label">
                {t("sort_by", { ns: "library" })}
              </DropdownMenuPrimitive.Label>

              <DropdownMenuPrimitive.CheckboxItem
                checked={showFavoritesFirst}
                onCheckedChange={onToggleFavoritesFirst}
                onSelect={(event) => event.preventDefault()}
                className="sidebar-filter-menu__item"
              >
                <HeartIcon size={14} />
                <span>{t("show_favorites_first")}</span>
                <DropdownMenuPrimitive.ItemIndicator
                  forceMount
                  className="sidebar-filter-menu__item-indicator"
                >
                  <CheckIcon size={14} />
                </DropdownMenuPrimitive.ItemIndicator>
              </DropdownMenuPrimitive.CheckboxItem>

              <DropdownMenuPrimitive.RadioGroup
                value={sortBy}
                onValueChange={(value) => onSortChange(value as SortOption)}
              >
                {sortOptions.map((option) => (
                  <DropdownMenuPrimitive.RadioItem
                    key={option.value}
                    value={option.value}
                    onSelect={(event) => event.preventDefault()}
                    className="sidebar-filter-menu__item"
                  >
                    {option.icon}
                    <span>{option.label}</span>
                    <DropdownMenuPrimitive.ItemIndicator
                      forceMount
                      className="sidebar-filter-menu__item-indicator"
                    >
                      <CheckIcon size={14} />
                    </DropdownMenuPrimitive.ItemIndicator>
                  </DropdownMenuPrimitive.RadioItem>
                ))}
              </DropdownMenuPrimitive.RadioGroup>
            </DropdownMenuPrimitive.Group>
          </div>

          {showPlatforms && (
            <>
              <div className="sidebar-filter-menu__divider" />

              <div className="sidebar-filter-menu__column">
                <FilterGroup
                  label={t("consoles_label")}
                  allLabel={t("all_consoles", { ns: "library" })}
                  options={platforms.map((platform) => ({
                    value: platform,
                    label: platform,
                  }))}
                  selected={selectedPlatforms}
                  onChange={onPlatformsChange}
                />
              </div>
            </>
          )}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
