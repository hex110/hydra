import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TriangleDownIcon, TriangleUpIcon } from "@primer/octicons-react";
import cn from "classnames";
import { omit } from "lodash-es";
import {
  BEST_RATED_MIN_REVIEWS,
  CATALOGUE_CHART_IDS,
  CHART_PLAYERS_MEASURE,
  DEFAULT_CHART_FILTERS,
  expandTagFamilies,
  filterChartRows,
  getStoreRating,
  STORE_RANKED_CHARTS,
  type CatalogueChartFilters,
  type CatalogueChartId,
  type CatalogueChartRequest,
  type CatalogueChartResult,
  type CatalogueChartRow,
  type ChartPeriod,
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
import { StoreGameRatingChip } from "@renderer/components/store-game-meta/store-game-meta";
import { useFormat } from "@renderer/hooks";
import { logger } from "@renderer/logger";

import {
  catalogueKey,
  isOwnedLibraryState,
  type CatalogueLibraryState,
} from "./catalogue-library-state";
import { useSteamTagLabels } from "./use-steam-tag-labels";
import { useTuneSettings } from "./use-tune-settings";
import {
  hashKey,
  readCatalogueSnapshot,
  writeCatalogueSnapshot,
} from "./catalogue-snapshots";
import { ChartPeriodPicker, formatPeriod } from "./chart-period-picker";
import "./catalogue-charts.scss";

const CHART_STORAGE_KEY = "catalogue-chart";
const FILTERS_STORAGE_KEY = "catalogue-chart-filters";
const RESULT_CACHE_MS = 2 * 60 * 1000;
/** Days of Hydra's own record before the Days in top 100 column says much. */
const DAYS_COLUMN_FROM = 7;
/** Fewer rows than this on a players chart after the period filter, and the chart offers Best rated instead. */
const FEW_ROWS = 10;
const MIN_REVIEW_OPTIONS = [50, 200, 500, 1000, 5000];
const TABLE_TAGS = 3;
const AVOID_KEYS = ["avoidTags", "avoidRelated"];
const SKELETON_ROWS = 12;

const DEFAULT_FILTERS: CatalogueChartFilters = {
  ...DEFAULT_CHART_FILTERS,
  minReviews: BEST_RATED_MIN_REVIEWS,
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
  const [chartFilters, setChartFilters] = useState<CatalogueChartFilters>(
    () => {
      const stored = {
        ...DEFAULT_FILTERS,
        ...readStored<Partial<CatalogueChartFilters>>(FILTERS_STORAGE_KEY, {}),
      };
      return MIN_REVIEW_OPTIONS.includes(stored.minReviews)
        ? stored
        : { ...stored, minReviews: BEST_RATED_MIN_REVIEWS };
    }
  );
  // The avoid list is one list for every surface that suggests games.
  const tune = useTuneSettings();
  const filters = useMemo(
    () => ({
      ...chartFilters,
      avoidTags: tune.options.avoidTags,
      avoidRelated: tune.options.avoidRelated,
    }),
    [chartFilters, tune.options.avoidTags, tune.options.avoidRelated]
  );
  const [result, setResult] = useState<CatalogueChartResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tiers, setTiers] = useState<Record<string, string | null>>({});
  const requestRef = useRef(0);

  const updateFilters = (changes: Partial<CatalogueChartFilters>) => {
    const { avoidTags, avoidRelated, ...own } = changes;
    if (avoidTags !== undefined || avoidRelated !== undefined) {
      tune.setOptions({
        ...(avoidTags !== undefined && { avoidTags }),
        ...(avoidRelated !== undefined && { avoidRelated }),
      });
    }
    if (Object.keys(own).length === 0) return;

    setChartFilters((current) => {
      const next = { ...current, ...own };
      writeStored(FILTERS_STORAGE_KEY, next);
      return next;
    });
  };

  const selectChart = (next: CatalogueChartId) => {
    // The old chart's rows would sit under the new chart's headings.
    setResult(null);
    setChart(next);
    writeStored(CHART_STORAGE_KEY, next);
  };

  const isStoreRanked = STORE_RANKED_CHARTS.includes(chart);
  const request = useMemo((): CatalogueChartRequest => {
    if (!isStoreRanked) return { chart };
    return {
      chart,
      period: filters.period,
      tags: filters.includeTags,
      untags: filters.avoidRelated
        ? expandTagFamilies(filters.avoidTags)
        : filters.avoidTags,
      minReviews: chart === "best-rated" ? filters.minReviews : 0,
    };
  }, [chart, isStoreRanked, filters]);
  const requestKey = JSON.stringify(request);

  const load = useCallback(
    async (force = false) => {
      const cached = resultCache.get(requestKey);
      if (!force && cached && Date.now() - cached.at < RESULT_CACHE_MS) {
        setResult(cached.result);
        setIsLoading(false);
        return;
      }

      const requestId = ++requestRef.current;
      const snapshotKey = `chart:${chart}:${hashKey(requestKey)}`;
      setIsLoading(true);

      // What this chart showed last time, while the new list loads.
      if (!cached) {
        void readCatalogueSnapshot<CatalogueChartResult>(snapshotKey).then(
          (snapshot) => {
            if (snapshot && requestId === requestRef.current) {
              setResult((current) => current ?? snapshot.data);
            }
          }
        );
      }

      try {
        const next = await window.electron.getCatalogueChart(request);
        if (requestId !== requestRef.current) return;

        if (!next.failed || next.rows.length > 0) {
          resultCache.set(requestKey, { at: Date.now(), result: next });
          writeCatalogueSnapshot(snapshotKey, next);
        }
        setResult((current) =>
          next.rows.length === 0 && (current?.rows.length ?? 0) > 0
            ? { ...(current as CatalogueChartResult), failed: next.failed }
            : next
        );
      } catch (error) {
        logger.error("Failed to load the chart", error);
        if (requestId === requestRef.current) {
          setResult((current) =>
            current
              ? { ...current, failed: "steam" }
              : {
                  rows: [],
                  failed: "steam",
                  collecting: null,
                  recordedDays: 0,
                  updatedAt: Date.now(),
                }
          );
        }
      } finally {
        if (requestId === requestRef.current) setIsLoading(false);
      }
    },
    // The request is identified by `requestKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [requestKey]
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
        { tiers, hidden, ignorePeriod: chart === "most-anticipated" }
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
    if (chart === "playing-now") {
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
      if ((result?.recordedDays ?? 0) >= DAYS_COLUMN_FROM) {
        list.push({
          id: "days",
          label: t("chart_column_days_on_chart"),
          hint: t("chart_column_days_on_chart_hint", {
            days: result?.recordedDays,
          }),
          width: "80px",
          align: "end",
          optional: true,
          sortValue: (row) => row.days,
          render: (row) => number(row.days),
        });
      }
    }
    if (chart === "most-reviewed") {
      list.push({
        id: "review-count",
        label: t("chart_column_review_count"),
        width: "96px",
        align: "end",
        sortValue: (row) => row.reviewCount,
        render: (row) => number(row.reviewCount),
      });
    }
    if (chart === "days-30" || chart === "days-90") {
      const recorded = result?.rows.some((row) => row.days !== null);
      if (recorded) {
        // steamcharts.com was down: Hydra's own record of Steam's top 100.
        list.push({
          id: "days",
          label: t("chart_column_days"),
          hint: t("chart_column_days_hint"),
          width: "90px",
          align: "end",
          sortValue: (row) => row.days,
          render: (row) => number(row.days),
        });
      } else {
        list.push(
          chart === "days-30"
            ? {
                id: "hours",
                label: t("chart_column_hours"),
                hint: t("chart_column_hours_hint"),
                width: "110px",
                align: "end",
                sortValue: (row) => row.hours,
                render: (row) => number(row.hours),
              }
            : {
                id: "players",
                label: t("chart_column_average"),
                hint: t("chart_column_average_hint"),
                width: "110px",
                align: "end",
                sortValue: (row) => row.players,
                render: (row) => number(row.players),
              },
          {
            id: "peak",
            label: t("chart_column_peak_window"),
            hint: t("chart_column_peak_window_hint"),
            width: "90px",
            align: "end",
            sortValue: (row) => row.peak,
            render: (row) => number(row.peak),
          }
        );
      }
    }

    list.push(
      {
        id: "reviews",
        label: t("chart_column_reviews"),
        width: "64px",
        align: "end",
        sortValue: (row) =>
          getStoreRating({
            reviewPercent: row.reviewPercent,
            reviewCount: row.reviewCount,
            criticScore: row.criticScore,
          })?.value ?? null,
        render: (row) => (
          <StoreGameRatingChip
            percent={row.reviewPercent}
            count={row.reviewCount}
            criticScore={row.criticScore}
          />
        ),
      },
      chart === "most-anticipated"
        ? {
            id: "release",
            label: t("chart_column_release"),
            width: "110px",
            align: "end",
            sortValue: (row) => row.releaseDate,
            render: (row) => formatRelease(row),
          }
        : {
            id: "year",
            label: t("chart_column_year"),
            width: "72px",
            align: "end",
            optional: true,
            sortValue: (row) => row.releaseDate,
            render: (row) => (
              <span className="catalogue-charts__year">
                {row.releaseYear ?? "–"}
                {row.leftEarlyAccessAt !== null && (
                  <span
                    className="catalogue-charts__full-release"
                    title={t("chart_full_release_hint", {
                      date: new Date(row.leftEarlyAccessAt).toLocaleDateString(
                        i18n.language
                      ),
                    })}
                  >
                    {t("chart_full_release")}
                  </span>
                )}
              </span>
            ),
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
    // formatRelease reads only the language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chart,
    formatNumber,
    isLinux,
    result,
    t,
    tagLabels,
    tiers,
    i18n.language,
  ]);

  function formatRelease(row: CatalogueChartRow) {
    if (row.releaseDate === null) return t("chart_coming_soon");
    const date = new Date(row.releaseDate);
    switch (row.releasePrecision) {
      case "year":
        return String(date.getUTCFullYear());
      case "quarter":
        return t("chart_quarter", {
          quarter: Math.floor(date.getUTCMonth() / 3) + 1,
          year: date.getUTCFullYear(),
        });
      case "month":
        return date.toLocaleDateString(i18n.language, {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        });
      case "unknown":
        return t("chart_coming_soon");
      default:
        return date.toLocaleDateString(i18n.language, {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
    }
  }

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
    JSON.stringify(omit(filters, ["minReviews", ...AVOID_KEYS])) !==
    JSON.stringify(omit(DEFAULT_FILTERS, ["minReviews", ...AVOID_KEYS]));

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
  } else if (
    !isStoreRanked &&
    chart !== "most-anticipated" &&
    filters.period.preset !== "any" &&
    rows.length < FEW_ROWS
  ) {
    body = (
      <div className="catalogue-charts__empty">
        <p>
          {t("chart_few_in_period", {
            count: rows.length,
            period: formatPeriod(filters.period, t, i18n.language),
          })}
        </p>
        <Button theme="outline" onClick={() => selectChart("best-rated")}>
          {t("chart_best_rated_in_period")}
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
        getRankHint={(row) =>
          row.rank !== rows.indexOf(row) + 1
            ? t("chart_rank_on_source", { rank: row.rank })
            : undefined
        }
      />
    );
  }

  const headingParts = [
    chart !== "most-anticipated" && filters.period.preset !== "any"
      ? formatPeriod(filters.period, t, i18n.language)
      : null,
    chart === "best-rated" && filters.minReviews > 0
      ? t("chart_heading_min_reviews", {
          count: filters.minReviews,
          formattedCount: formatNumber(filters.minReviews),
        })
      : null,
  ].filter(Boolean);

  const sinceLabel = result?.collecting?.since
    ? new Date(`${result.collecting.since}T00:00:00`).toLocaleDateString(
        i18n.language,
        { day: "numeric", month: "long" }
      )
    : null;

  return (
    <div className="catalogue__content">
      <div className="catalogue-charts__main">
        <h2 className="catalogue-charts__title">
          {t(`chart_${chart}`)}
          {headingParts.length > 0 && (
            <span className="catalogue-charts__title-scope">
              {" · "}
              {headingParts.join(" · ")}
            </span>
          )}
        </h2>
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
            </div>
          </SidebarSection>

          <SidebarSection title={t("chart_filters")}>
            <div className="catalogue-charts__section">
              {chart !== "most-anticipated" && (
                <ChartPeriodPicker
                  value={filters.period}
                  onChange={(period: ChartPeriod) => updateFilters({ period })}
                />
              )}

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
                  options={MIN_REVIEW_OPTIONS.map((count) => ({
                    key: String(count),
                    value: String(count),
                    label: formatNumber(count),
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
