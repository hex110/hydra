import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TriangleDownIcon, TriangleUpIcon } from "@primer/octicons-react";
import cn from "classnames";
import { orderBy } from "lodash-es";

import { buildGameDetailsPath } from "@renderer/helpers";
import { Link } from "@renderer/components/link/link";
import { GameLibraryBadge } from "@renderer/components/game-library-badge/game-library-badge";
import { StoreGameActions } from "@renderer/components/store-game-actions/store-game-actions";
import type { StoreGameCardGame } from "@renderer/components/store-game-card/store-game-card";
import type { CatalogueLibraryState } from "@renderer/pages/catalogue/catalogue-library-state";
import "@renderer/components/store-game-card/store-game.scss";
import "./store-game-table.scss";

export interface StoreGameTableColumn<Row> {
  id: string;
  label: string;
  /** What the heading's tooltip says, when the label needs more. */
  hint?: string;
  /** A grid track: `90px`, `minmax(0, 1fr)`. */
  width: string;
  align?: "end";
  /** Left out when the table is narrow. */
  optional?: boolean;
  render: (row: Row) => ReactNode;
  /** Makes the heading sort by this; larger first on the first click. */
  sortValue?: (row: Row) => number | string | null;
}

export interface StoreGameTableProps<Row> {
  rows: Row[];
  columns: StoreGameTableColumn<Row>[];
  getKey: (row: Row) => string;
  getGame: (row: Row) => StoreGameCardGame;
  getLibraryState?: (row: Row) => CatalogueLibraryState | undefined;
  /** Shown over the rows while the list is on its way. */
  isLoading?: boolean;
}

const RANK_WIDTH = "32px";
const GAME_WIDTH = "minmax(0, 1.6fr)";

/**
 * A ranked list of store games: rank, cover and title, then the columns the
 * caller gives. The list's own order is the default; clicking a heading sorts
 * by it, and clicking it again reverses, then restores the list's order.
 */
export function StoreGameTable<Row>({
  rows,
  columns,
  getKey,
  getGame,
  getLibraryState,
  isLoading = false,
}: Readonly<StoreGameTableProps<Row>>) {
  const { t } = useTranslation("catalogue");
  const [sort, setSort] = useState<{
    id: string;
    direction: "desc" | "asc";
  } | null>(null);

  const toTemplate = (list: StoreGameTableColumn<Row>[]) =>
    [RANK_WIDTH, GAME_WIDTH, ...list.map((column) => column.width)].join(" ");

  const sorted = useMemo(() => {
    const column = columns.find((entry) => entry.id === sort?.id);
    if (!sort || !column?.sortValue) return rows;

    const sortValue = column.sortValue;
    return orderBy(
      rows.map((row, index) => ({ row, index })),
      [
        // Rows with nothing to sort by go last, in the list's order.
        ({ row }) => sortValue(row) === null,
        ({ row }) => sortValue(row),
        "index",
      ],
      ["asc", sort.direction, "asc"]
    ).map(({ row }) => row);
  }, [rows, columns, sort]);

  const rankOf = useMemo(
    () => new Map(rows.map((row, index) => [getKey(row), index + 1])),
    [rows, getKey]
  );

  const handleSort = (id: string) =>
    setSort((current) => {
      if (current?.id !== id) return { id, direction: "desc" };
      return current.direction === "desc" ? { id, direction: "asc" } : null;
    });

  const indicator = (id: string) =>
    sort?.id === id &&
    (sort.direction === "asc" ? (
      <TriangleUpIcon size={14} />
    ) : (
      <TriangleDownIcon size={14} />
    ));

  return (
    <div
      className={cn("store-game-table", {
        "store-game-table--loading": isLoading,
      })}
      role="table"
      style={
        {
          "--store-game-table-columns": toTemplate(columns),
          "--store-game-table-compact-columns": toTemplate(
            columns.filter((column) => !column.optional)
          ),
        } as CSSProperties
      }
    >
      <div className="store-game-table__header" role="row">
        <button
          type="button"
          role="columnheader"
          className={cn("store-game-table__heading", {
            "store-game-table__heading--active": sort === null,
          })}
          onClick={() => setSort(null)}
          title={t("chart_column_rank_hint")}
        >
          #
        </button>
        <span role="columnheader" className="store-game-table__heading">
          {t("chart_column_game")}
        </span>
        {columns.map((column) => (
          <button
            key={column.id}
            type="button"
            role="columnheader"
            disabled={!column.sortValue}
            className={cn("store-game-table__heading", {
              "store-game-table__heading--end": column.align === "end",
              "store-game-table__optional": column.optional,
              "store-game-table__heading--active": sort?.id === column.id,
            })}
            title={column.hint ?? t("chart_sort_by", { column: column.label })}
            onClick={() => handleSort(column.id)}
          >
            <span>{column.label}</span>
            {indicator(column.id)}
          </button>
        ))}
      </div>

      {sorted.map((row) => {
        const game = getGame(row);
        const libraryState = getLibraryState?.(row);

        return (
          <div
            key={getKey(row)}
            className="store-game store-game-table__row"
            role="row"
          >
            <span className="store-game-table__rank" role="cell">
              {rankOf.get(getKey(row))}
            </span>
            <div className="store-game-table__game" role="cell">
              <div className="store-game-table__cover">
                {game.libraryImageUrl && (
                  <img
                    src={game.libraryImageUrl}
                    alt=""
                    width={120}
                    height={56}
                    loading="lazy"
                  />
                )}
                <GameLibraryBadge state={libraryState} overlay />
              </div>
              <Link
                to={buildGameDetailsPath(game)}
                className="store-game-table__title"
                title={game.title}
              >
                {game.title}
              </Link>
            </div>
            {columns.map((column) => (
              <span
                key={column.id}
                role="cell"
                className={cn("store-game-table__cell", {
                  "store-game-table__cell--end": column.align === "end",
                  "store-game-table__optional": column.optional,
                })}
              >
                {column.render(row)}
              </span>
            ))}
            <div className="store-game-table__actions">
              <StoreGameActions game={game} libraryState={libraryState} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
