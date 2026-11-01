import { TriangleDownIcon, TriangleUpIcon } from "@primer/octicons-react";
import { useTranslation } from "react-i18next";
import type { SortOption } from "./filter-options";
import {
  getLibraryListTemplate,
  LIBRARY_LIST_COLUMN_SORT,
  type LibraryListColumn,
} from "./library-list";
import "./library-list.scss";

interface LibraryListHeaderProps {
  columns: LibraryListColumn[];
  sortBy: SortOption;
  onSortChange: (sortBy: SortOption) => void;
}

/** Column headings sort the list; Title flips between A-Z and Z-A. */
export function LibraryListHeader({
  columns,
  sortBy,
  onSortChange,
}: Readonly<LibraryListHeaderProps>) {
  const { t } = useTranslation("library");

  const headings = [
    {
      id: "title",
      label: t("list_column_title"),
      active: sortBy === "title_asc" || sortBy === "title_desc",
      ascending: sortBy !== "title_desc",
      sort: (sortBy === "title_asc" ? "title_desc" : "title_asc") as SortOption,
    },
    ...columns.map((column) => ({
      id: column,
      label: t(`list_column_${column}`),
      active: sortBy === LIBRARY_LIST_COLUMN_SORT[column],
      ascending: false,
      sort: LIBRARY_LIST_COLUMN_SORT[column],
    })),
  ];

  return (
    <div
      className="library-list__header"
      style={{ gridTemplateColumns: getLibraryListTemplate(columns) }}
    >
      {headings.map((heading) => (
        <button
          key={heading.id}
          type="button"
          className={`library-list__heading${heading.active ? " library-list__heading--active" : ""}`}
          onClick={() => onSortChange(heading.sort)}
          title={t("list_sort_by", { column: heading.label })}
        >
          <span>{heading.label}</span>
          {heading.active &&
            (heading.ascending ? (
              <TriangleUpIcon size={14} />
            ) : (
              <TriangleDownIcon size={14} />
            ))}
        </button>
      ))}
    </div>
  );
}
