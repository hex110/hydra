import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TriangleDownIcon, TriangleUpIcon } from "@primer/octicons-react";
import cn from "classnames";
import {
  CATALOGUE_CHART_IDS,
  CHART_PLAYERS_MEASURE,
  DEFAULT_CHART_FILTERS,
  filterChartRows,
  type CatalogueChartFilters,
  type CatalogueChartId,
  type CatalogueChartResult,
  type CatalogueChartRow,
} from "@shared";

import {
  Button,
  CheckboxField,
  RadioField,
  SegmentedControl,
  SelectField,
  SidebarSection,
  StoreGameTable,
  TagPicker,
  type StoreGameTableColumn,
} from "@renderer/components";
import { StoreGameReviewChip } from "@renderer/components/store-game-meta/store-game-meta";
import { useFormat } from "@renderer/hooks";
import { logger } from "@renderer/logger";

import {
  catalogueKey,
  isOwnedLibraryState,
  type CatalogueLibraryState,
} from "./catalogue-library-state";
import { useSteamTagLabels } from "./use-steam-tag-labels";
import "./catalogue-charts.scss";

const CHART_STORAGE_KEY = "catalogue-chart";
const FILTERS_STORAGE_KEY = "catalogue-chart-filters";
const RESULT_CACHE_MS = 2 * 60 * 1000;
const DEFAULT_BEST_RATED_MIN_REVIEWS = 1000;
const TABLE_TAGS = 3;
const SKELETON_ROWS = 12;

const DEFAULT_FILTERS: CatalogueChartFilters = {
  ...DEFAULT_CHART_FILTERS,
  minReviews: DEFAULT_BEST_RATED_MIN_REVIEWS,
};

const resultCache = new Map<
  string,
  { at: number; result: CatalogueChartResult }
>();

const readStored = <T,>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : (JSON.parse(value) as T);
  } catch {
    return fallback;
  }
};

const writeStored = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* not persisted */
  }
};

const readChart = (): CatalogueChartId => {
  const stored = readStored<string>(CHART_STORAGE_KEY, "playing-now");
  return (CATALOGUE_CHART_IDS as readonly string[]).includes(stored)
    ? (stored as CatalogueChartId)
    : "playing-now";
};

interface CatalogueChartsProps {
  hideOwned: boolean;
  libraryStates: Map<string, CatalogueLibraryState>;
}

/** Steam's charts and the best rated games, as one table with filters. */
export function CatalogueCharts({
  hideOwned,
  libraryStates,
}: Readonly<CatalogueChartsProps>) {
  const { t, i18n } = useTranslation("catalogue");
  const { formatNumber } = useFormat();
  const tagLabels = useSteamTagLabels();
  const isLinux = window.electron.platform === "linux";

  const [chart, setChart] = useState(readChart);
  const [month, setMonth] = useState<number | undefined>();
  const [filters, setFilters] = useState<CatalogueChartFilters>(() => ({
    ...DEFAULT_FILTERS,
    ...readStored<Partial<CatalogueChartFilters>>(FILTERS_STORAGE_KEY, {}),
  }));
  const [result, setResult] = useState<CatalogueChartResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tiers, setTiers] = useState<Record<string, string | null>>({});
  const requestRef = useRef(0);

  const updateFilters = (changes: Partial<CatalogueChartFilters>) =>
    setFilters((current) => {
      const next = { ...current, ...changes };
      writeStored(FILTERS_STORAGE_KEY, next);
      return next;
    });

  const selectChart = (next: CatalogueChartId) => {
    setChart(next);
    setMonth(undefined);
    writeStored(CHART_STORAGE_KEY, next);
  };

  const load = useCallback(
    async (force = false) => {
      const cacheKey = `${chart}|${month ?? ""}`;
      const cached = resultCache.get(cacheKey);
      if (!force && cached && Date.now() - cached.at < RESULT_CACHE_MS) {
        setResult(cached.result);
        setIsLoading(false);
        return;
      }

      const requestId = ++requestRef.current;
      setIsLoading(true);
      try {
        const next = await window.electron.getCatalogueChart({ chart, month });
        if (requestId !== requestRef.current) return;

        if (!next.failed) {
          resultCache.set(cacheKey, { at: Date.now(), result: next });
        }
        setResult(next);
      } catch (error) {
        logger.error("Failed to load the chart", error);
        if (requestId === requestRef.current) {
          setResult({
            rows: [],
            failed: "steam",
            collecting: null,
            months: [],
            updatedAt: Date.now(),
          });
        }
      } finally {
        if (requestId === requestRef.current) setIsLoading(false);
      }
    },
    [chart, month]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // ProtonDB tiers come one request per game, so they fill in after the rows.
  useEffect(() => {
    if (!isLinux || !result) return;

    const missing = result.rows
      .map((row) => row.appId)
      .filter((appId) => !(appId in tiers));
    if (missing.length === 0) return;

    let current = true;
    window.electron
      .getProtonDbTiers(missing)
      .then((found) => {
        if (current) setTiers((known) => ({ ...known, ...found }));
      })
      .catch((error) => logger.error("Failed to load ProtonDB tiers", error));
    return () => {
      current = false;
    };
    // Tiers already known are skipped; the rows are what changes.
  }, [result, isLinux]); // eslint-disable-line react-hooks/exhaustive-deps

  const hidden = useMemo(() => {
    if (!hideOwned) return undefined;
    return new Set(
      (result?.rows ?? [])
        .filter((row) =>
          isOwnedLibraryState(
            libraryStates.get(
              catalogueKey({ shop: "steam", objectId: row.appId })
            )
          )
        )
        .map((row) => row.appId)
    );
  }, [hideOwned, result, libraryStates]);

  const rows = useMemo(
    () =>
      filterChartRows(
        result?.rows ?? [],
        {
          ...filters,
          minReviews: chart === "best-rated" ? filters.minReviews : 0,
        },
        { tiers, hidden }
      ),
    [result, filters, chart, tiers, hidden]
  );

  const columns = useMemo(() => {
    const number = (value: number | null) =>
      value === null ? "–" : formatNumber(value);

    const list: StoreGameTableColumn<CatalogueChartRow>[] = [
      {
        id: "tags",
        label: t("chart_column_tags"),
        width: "minmax(0, 1.2fr)",
        optional: true,
        render: (row) =>
          row.tagIds
            .flatMap((id) => tagLabels.get(id) ?? [])
            .slice(0, TABLE_TAGS)
            .join(", "),
      },
    ];

    const measure = CHART_PLAYERS_MEASURE[chart];
    if (chart === "playing-now" || chart === "singleplayer") {
      list.push({
        id: "players",
        label: t(`chart_column_players_${measure}`),
        hint: t(`chart_column_players_${measure}_hint`),
        width: "96px",
        align: "end",
        sortValue: (row) => row.players,
        render: (row) => number(row.players),
      });
    }
    if (
      chart === "playing-now" ||
      chart === "most-played" ||
      chart === "trending"
    ) {
      list.push({
        id: "peak",
        label: t("chart_column_peak"),
        hint: t("chart_column_peak_hint"),
        width: "90px",
        align: "end",
        sortValue: (row) => row.peak,
        render: (row) => number(row.peak),
      });
    }
    if (chart === "most-played" || chart === "trending") {
      list.push({
        id: "movement",
        label: t("chart_column_movement"),
        hint: t("chart_column_movement_hint"),
        width: "90px",
        align: "end",
        sortValue: (row) => (row.isNew ? Infinity : row.places),
        render: (row) => <Movement row={row} />,
      });
    }
    if (chart === "days-30" || chart === "days-90") {
      list.push({
        id: "days",
        label: t("chart_column_days"),
        hint: t("chart_column_days_hint"),
        width: "90px",
        align: "end",
        sortValue: (row) => row.days,
        render: (row) => number(row.days),
      });
    }

    list.push(
      {
        id: "reviews",
        label: t("chart_column_reviews"),
        width: "64px",
        align: "end",
        sortValue: (row) => row.reviewPercent,
        render: (row) => (
          <StoreGameReviewChip
            percent={row.reviewPercent}
            count={row.reviewCount}
          />
        ),
      },
      {
        id: "year",
        label: t("chart_column_year"),
        width: "56px",
        align: "end",
        optional: true,
        sortValue: (row) => row.releaseYear,
        render: (row) => row.releaseYear ?? "–",
      }
    );

    if (isLinux) {
      list.push({
        id: "protondb",
        label: t("protondb"),
        width: "80px",
        render: (row) => <ProtonTier tier={tiers[row.appId]} />,
      });
    }

    return list;
  }, [chart, formatNumber, isLinux, t, tagLabels, tiers]);

  const getGame = useCallback(
    (row: CatalogueChartRow) => ({
      shop: "steam" as const,
      objectId: row.appId,
      title: row.title,
      libraryImageUrl: row.headerImageUrl,
    }),
    []
  );

  const filtersChanged =
    JSON.stringify({ ...filters, minReviews: 0 }) !==
    JSON.stringify({ ...DEFAULT_FILTERS, minReviews: 0 });

  const failure = result?.failed ? t(`chart_failed_${result.failed}`) : null;

  let body;
  if (isLoading && !result) {
    body = (
      <div className="catalogue-charts__skeleton" aria-hidden>
        {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
          <div key={index} className="catalogue-charts__skeleton-row" />
        ))}
      </div>
    );
  } else if (failure && (result?.rows.length ?? 0) === 0) {
    body = (
      <div className="catalogue-charts__empty">
        <p>{failure}</p>
        <Button theme="outline" onClick={() => void load(true)}>
          {t("chart_retry")}
        </Button>
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <div className="catalogue-charts__empty">
        <p>
          {t(filtersChanged || hideOwned ? "chart_no_match" : "chart_empty")}
        </p>
        {filtersChanged && (
          <Button
            theme="outline"
            onClick={() =>
              updateFilters({
                ...DEFAULT_FILTERS,
                avoidTags: filters.avoidTags,
              })
            }
          >
            {t("chart_reset_filters")}
          </Button>
        )}
      </div>
    );
  } else {
    body = (
      <StoreGameTable
        rows={rows}
        columns={columns}
        getKey={(row) => row.appId}
        getGame={getGame}
        getLibraryState={(row) =>
          libraryStates.get(
            catalogueKey({ shop: "steam", objectId: row.appId })
          )
        }
        isLoading={isLoading}
      />
    );
  }

  const sinceLabel = result?.collecting?.since
    ? new Date(`${result.collecting.since}T00:00:00`).toLocaleDateString(
        i18n.language,
        { day: "numeric", month: "long" }
      )
    : null;

  return (
    <div className="catalogue__content">
      <div className="catalogue-charts__main">
        <h2 className="catalogue-charts__title">{t(`chart_${chart}`)}</h2>
        <p className="catalogue-charts__description">
          {t(`chart_${chart}_description`)}
        </p>

        {result?.collecting && (
          <p className="catalogue-charts__notice">
            {t("chart_collecting", {
              since: sinceLabel ?? t("chart_collecting_today"),
              days: result.collecting.days,
              needed: result.collecting.needed,
            })}
          </p>
        )}
        {failure && (result?.rows.length ?? 0) > 0 && (
          <p className="catalogue-charts__notice">{failure}</p>
        )}

        {body}
      </div>

      <div className="catalogue__filters-container">
        <div className="catalogue__filters-sections">
          <SidebarSection title={t("charts_section")}>
            <div className="catalogue-charts__section">
              {CATALOGUE_CHART_IDS.map((id) => (
                <RadioField
                  key={id}
                  name="catalogue-chart"
                  label={t(`chart_${id}`)}
                  checked={chart === id}
                  onChange={() => selectChart(id)}
                />
              ))}
              {chart === "top-releases" && (result?.months.length ?? 0) > 0 && (
                <SelectField
                  theme="dark"
                  label={t("chart_month")}
                  value={String(month ?? result?.months[0]?.startOfMonth)}
                  options={result?.months.map((entry) => ({
                    key: String(entry.startOfMonth),
                    value: String(entry.startOfMonth),
                    label: entry.name.replace(/^Top Releases of /, ""),
                  }))}
                  onChange={(event) => setMonth(Number(event.target.value))}
                />
              )}
            </div>
          </SidebarSection>

          <SidebarSection title={t("chart_filters")}>
            <div className="catalogue-charts__section">
              <span className="catalogue-charts__label">{t("tags")}</span>
              <TagPicker
                value={filters.includeTags}
                onChange={(includeTags) => updateFilters({ includeTags })}
                labels={tagLabels}
                placeholder={t("chart_tags_placeholder")}
                label={t("tags")}
              />

              <span className="catalogue-charts__label">{t("avoid_tags")}</span>
              <TagPicker
                value={filters.avoidTags}
                onChange={(avoidTags) => updateFilters({ avoidTags })}
                labels={tagLabels}
                placeholder={t("avoid_tags_placeholder")}
                label={t("avoid_tags")}
              />
              <CheckboxField
                label={t("avoid_related_tags")}
                checked={filters.avoidRelated}
                onChange={(event) =>
                  updateFilters({ avoidRelated: event.target.checked })
                }
              />

              {isLinux && (
                <SelectField
                  theme="dark"
                  label={t("protondb_minimum")}
                  value={filters.protondb}
                  options={[
                    { key: "any", value: "any", label: t("filter_any") },
                    {
                      key: "silver",
                      value: "silver",
                      label: t("protondb_silver_plus"),
                    },
                    {
                      key: "gold",
                      value: "gold",
                      label: t("protondb_gold_plus"),
                    },
                    {
                      key: "platinum",
                      value: "platinum",
                      label: t("protondb_platinum_only"),
                    },
                  ]}
                  onChange={(event) =>
                    updateFilters({
                      protondb: event.target
                        .value as CatalogueChartFilters["protondb"],
                    })
                  }
                />
              )}

              <CheckboxField
                label={t("singleplayer_only")}
                checked={filters.singleplayerOnly}
                onChange={(event) =>
                  updateFilters({ singleplayerOnly: event.target.checked })
                }
              />
              <CheckboxField
                label={t("hide_early_access")}
                checked={filters.hideEarlyAccess}
                onChange={(event) =>
                  updateFilters({ hideEarlyAccess: event.target.checked })
                }
              />

              <span className="catalogue-charts__label">
                {t("free_to_play")}
              </span>
              <SegmentedControl
                label={t("free_to_play")}
                value={filters.freeToPlay}
                options={[
                  { value: "any", label: t("filter_any") },
                  { value: "only", label: t("filter_only") },
                  { value: "hide", label: t("filter_hide") },
                ]}
                onChange={(freeToPlay) => updateFilters({ freeToPlay })}
              />

              {chart === "best-rated" && (
                <SelectField
                  theme="dark"
                  label={t("chart_min_reviews")}
                  value={String(filters.minReviews)}
                  options={[0, 100, 1000, 10000].map((count) => ({
                    key: String(count),
                    value: String(count),
                    label: count === 0 ? t("filter_any") : formatNumber(count),
                  }))}
                  onChange={(event) =>
                    updateFilters({ minReviews: Number(event.target.value) })
                  }
                />
              )}
            </div>
          </SidebarSection>
        </div>
      </div>
    </div>
  );
}

function Movement({ row }: Readonly<{ row: CatalogueChartRow }>) {
  const { t } = useTranslation("catalogue");

  if (row.isNew) {
    return <span className="catalogue-charts__new">{t("chart_new")}</span>;
  }
  if (!row.places) return <span>–</span>;

  const up = row.places > 0;
  return (
    <span
      className={cn("catalogue-charts__movement", {
        "catalogue-charts__movement--up": up,
        "catalogue-charts__movement--down": !up,
      })}
    >
      {up ? <TriangleUpIcon size={14} /> : <TriangleDownIcon size={14} />}
      {Math.abs(row.places)}
    </span>
  );
}

function ProtonTier({ tier }: Readonly<{ tier: string | null | undefined }>) {
  const { t } = useTranslation("game_details");
  if (!tier) return <span>–</span>;

  return (
    <span
      className={cn(
        "catalogue-charts__tier",
        `catalogue-charts__tier--${tier}`
      )}
    >
      {t(`protondb_tier_${tier}`, { defaultValue: tier })}
    </span>
  );
}
