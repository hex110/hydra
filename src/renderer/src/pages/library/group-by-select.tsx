import { useTranslation } from "react-i18next";
import { LibrarySelect } from "./library-select";
import {
  LIBRARY_GROUP_BY_OPTIONS,
  type LibraryGroupBy,
} from "./library-grouping";
import "./filter-options.scss";

interface GroupBySelectProps {
  groupBy: LibraryGroupBy;
  onGroupByChange: (groupBy: LibraryGroupBy) => void;
}

export function GroupBySelect({
  groupBy,
  onGroupByChange,
}: Readonly<GroupBySelectProps>) {
  const { t } = useTranslation("library");

  return (
    <div className="library-filter-options__container">
      <span className="library-filter-options__label">{t("group_by")}</span>
      <LibrarySelect
        value={groupBy}
        ariaLabel={t("group_by")}
        onChange={(value) => onGroupByChange(value as LibraryGroupBy)}
        options={LIBRARY_GROUP_BY_OPTIONS.map((option) => ({
          value: option,
          label: t(`group_by_${option}`),
        }))}
      />
    </div>
  );
}
