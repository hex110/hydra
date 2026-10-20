import { useTranslation } from "react-i18next";
import { LibrarySelect } from "./library-select";
import "./filter-options.scss";

export type SortOption =
  | "title_asc"
  | "recently_played"
  | "most_played"
  | "achievements"
  | "installed_first"
  | "title_desc"
  | "recently_added"
  | "release_date"
  | "critic_score"
  | "installed_size"
  | "shortest";

export const SORT_OPTIONS: SortOption[] = [
  "title_asc",
  "title_desc",
  "recently_played",
  "most_played",
  "recently_added",
  "release_date",
  "critic_score",
  "shortest",
  "achievements",
  "installed_first",
  "installed_size",
];

const SORT_LABEL_KEYS: Record<SortOption, string> = {
  title_asc: "sort_title_asc",
  title_desc: "sort_title_desc",
  recently_played: "recently_played",
  most_played: "sort_most_played",
  recently_added: "sort_recently_added",
  release_date: "sort_release_date",
  critic_score: "sort_critic_score",
  shortest: "sort_shortest",
  achievements: "sort_achievements",
  installed_first: "sort_installed_first",
  installed_size: "sort_installed_size",
};

interface FilterOptionsProps {
  sortBy: SortOption;
  onSortChange: (sortBy: SortOption) => void;
}

export function FilterOptions({
  sortBy,
  onSortChange,
}: Readonly<FilterOptionsProps>) {
  const { t } = useTranslation("library");

  return (
    <div className="library-filter-options__container">
      <span className="library-filter-options__label">{t("sort_by")}</span>
      <LibrarySelect
        value={sortBy}
        ariaLabel={t("sort_by")}
        onChange={(value) => onSortChange(value as SortOption)}
        options={SORT_OPTIONS.map((option) => ({
          value: option,
          label: t(SORT_LABEL_KEYS[option]),
        }))}
      />
    </div>
  );
}
