import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FilterIcon,
} from "@primer/octicons-react";
import { useTranslation } from "react-i18next";
import { PLAY_STATUSES } from "@shared";
import { useCloseOnLibraryScroll } from "./use-close-on-library-scroll";
import {
  LIBRARY_DROPDOWN_CHEVRON_SIZE,
  LIBRARY_DROPDOWN_COLLISION_PADDING,
  LIBRARY_DROPDOWN_SIDE_OFFSET,
} from "./library-dropdown";
import {
  countActiveLibraryFilters,
  CRITIC_SCORE_RANGES,
  EMPTY_LIBRARY_FILTERS,
  HOW_LONG_TO_BEAT_RANGES,
  PROTONDB_TIERS,
  SIZE_RANGES,
  type LibraryFilters,
} from "./library-filters";
import "./library-filters-menu.scss";

const INDICATOR_SIZE = 14;

type ListFilterKey = Exclude<
  keyof LibraryFilters,
  "neverPlayed" | "hideDuplicates"
>;

interface FilterOption {
  value: string;
  label: string;
}

interface LibraryFiltersMenuProps {
  filters: LibraryFilters;
  genres: string[];
  showProtonDb: boolean;
  onFiltersChange: (filters: LibraryFilters) => void;
}

function CheckItem({
  checked,
  label,
  onCheckedChange,
}: Readonly<{
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      checked={checked}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      onSelect={(event) => event.preventDefault()}
      className="library-filters-menu__item"
    >
      <span className="library-filters-menu__item-label">{label}</span>
      <DropdownMenuPrimitive.ItemIndicator
        forceMount
        className="library-filters-menu__item-indicator"
      >
        <CheckIcon size={INDICATOR_SIZE} />
      </DropdownMenuPrimitive.ItemIndicator>
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

export function LibraryFiltersMenu({
  filters,
  genres,
  showProtonDb,
  onFiltersChange,
}: Readonly<LibraryFiltersMenuProps>) {
  const { t } = useTranslation("library");
  const [open, setOpen] = useCloseOnLibraryScroll();
  const activeCount = countActiveLibraryFilters(filters);

  const toggle = (key: ListFilterKey, value: string, checked: boolean) => {
    const current = filters[key] as string[];
    onFiltersChange({
      ...filters,
      [key]: checked
        ? [...current, value]
        : current.filter((item) => item !== value),
    });
  };

  const rangeOptions = (prefix: string, ranges: readonly { id: string }[]) =>
    ranges.map((range) => ({
      value: range.id,
      label: t(`${prefix}_${range.id}`),
    }));

  const sections: {
    key: ListFilterKey;
    label: string;
    options: FilterOption[];
    emptyLabel?: string;
  }[] = [
    {
      key: "playStatuses",
      label: t("filter_play_status"),
      options: [
        ...PLAY_STATUSES.map((status) => ({
          value: status,
          label: t(`play_status_${status}`),
        })),
        { value: "none", label: t("play_status_none") },
      ],
    },
    {
      key: "genres",
      label: t("filter_genre"),
      options: genres.map((genre) => ({ value: genre, label: genre })),
      emptyLabel: t("filter_genre_empty"),
    },
    ...(showProtonDb
      ? [
          {
            key: "protonDbTiers" as const,
            label: t("filter_protondb"),
            options: PROTONDB_TIERS.map((tier) => ({
              value: tier,
              label: t(`protondb_tier_${tier}`),
            })),
          },
        ]
      : []),
    {
      key: "howLongToBeat",
      label: t("filter_length"),
      options: rangeOptions("filter_length", HOW_LONG_TO_BEAT_RANGES),
    },
    {
      key: "criticScores",
      label: t("filter_critic_score"),
      options: rangeOptions("filter_critic_score", CRITIC_SCORE_RANGES),
    },
    {
      key: "sizes",
      label: t("filter_size"),
      options: rangeOptions("filter_size", SIZE_RANGES),
    },
  ];

  return (
    <DropdownMenuPrimitive.Root
      modal={false}
      open={open}
      onOpenChange={setOpen}
    >
      <DropdownMenuPrimitive.Trigger asChild>
        <button
          type="button"
          className={`library-filters-menu__trigger${activeCount > 0 ? " library-filters-menu__trigger--active" : ""}`}
          aria-label={t("filters")}
        >
          <FilterIcon size={16} />
          <span>{t("filters")}</span>
          {activeCount > 0 && (
            <span className="library-filters-menu__count">{activeCount}</span>
          )}
          <ChevronDownIcon
            size={LIBRARY_DROPDOWN_CHEVRON_SIZE}
            className="library-filters-menu__chevron"
          />
        </button>
      </DropdownMenuPrimitive.Trigger>

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="start"
          sideOffset={LIBRARY_DROPDOWN_SIDE_OFFSET}
          collisionPadding={LIBRARY_DROPDOWN_COLLISION_PADDING}
          className="library-filters-menu__content"
        >
          {sections.map((section) => {
            const selected = filters[section.key] as string[];

            return (
              <DropdownMenuPrimitive.Sub key={section.key}>
                <DropdownMenuPrimitive.SubTrigger className="library-filters-menu__item">
                  <span className="library-filters-menu__item-label">
                    {section.label}
                  </span>
                  {selected.length > 0 && (
                    <span className="library-filters-menu__count">
                      {selected.length}
                    </span>
                  )}
                  <ChevronRightIcon size={INDICATOR_SIZE} />
                </DropdownMenuPrimitive.SubTrigger>
                <DropdownMenuPrimitive.Portal>
                  <DropdownMenuPrimitive.SubContent
                    sideOffset={4}
                    collisionPadding={LIBRARY_DROPDOWN_COLLISION_PADDING}
                    className="library-filters-menu__content library-filters-menu__content--sub"
                  >
                    {section.options.length === 0 && (
                      <p className="library-filters-menu__empty">
                        {section.emptyLabel}
                      </p>
                    )}
                    {section.options.map((option) => (
                      <CheckItem
                        key={option.value}
                        checked={selected.includes(option.value)}
                        label={option.label}
                        onCheckedChange={(checked) =>
                          toggle(section.key, option.value, checked)
                        }
                      />
                    ))}
                  </DropdownMenuPrimitive.SubContent>
                </DropdownMenuPrimitive.Portal>
              </DropdownMenuPrimitive.Sub>
            );
          })}

          <DropdownMenuPrimitive.Separator className="library-filters-menu__separator" />

          <CheckItem
            checked={filters.neverPlayed}
            label={t("filter_never_played")}
            onCheckedChange={(neverPlayed) =>
              onFiltersChange({ ...filters, neverPlayed })
            }
          />
          <CheckItem
            checked={filters.hideDuplicates}
            label={t("filter_hide_duplicates")}
            onCheckedChange={(hideDuplicates) =>
              onFiltersChange({ ...filters, hideDuplicates })
            }
          />

          {activeCount > 0 && (
            <>
              <DropdownMenuPrimitive.Separator className="library-filters-menu__separator" />
              <DropdownMenuPrimitive.Item
                className="library-filters-menu__item"
                onSelect={() =>
                  onFiltersChange({
                    ...EMPTY_LIBRARY_FILTERS,
                    hideDuplicates: filters.hideDuplicates,
                  })
                }
              >
                <span className="library-filters-menu__item-label">
                  {t("clear_filters")}
                </span>
              </DropdownMenuPrimitive.Item>
            </>
          )}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
