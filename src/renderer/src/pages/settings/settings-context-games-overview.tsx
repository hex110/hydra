import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  COMPATIBILITY_OVERVIEW_FILTERS,
  countCompatibilityFilters,
  matchesCompatibilityFilter,
} from "@shared";

import { SelectField } from "@renderer/components";
import { useDate } from "@renderer/hooks";
import { logger } from "@renderer/logger";
import type {
  CompatibilityOverviewFilter,
  CompatibilityOverviewRow,
  CompatibilityToolState,
} from "@types";

import { BulkToolActions } from "./settings-games-bulk-actions";
import "./settings-games-overview.scss";

const FAILED_OUTCOMES = new Set(["error", "closed_early", "launch_failed"]);

export function SettingsContextGamesOverview() {
  const { t } = useTranslation("settings");
  const { t: tGame } = useTranslation("game_details");
  const { formatDistance } = useDate();
  const navigate = useNavigate();
  const [rows, setRows] = useState<CompatibilityOverviewRow[] | null>(null);
  const [filter, setFilter] = useState<CompatibilityOverviewFilter>("all");

  const refresh = useCallback(() => {
    window.electron
      .getCompatibilityOverview()
      .then(setRows)
      .catch((error) => {
        logger.error("Failed to load the games overview", error);
        setRows([]);
      });
  }, []);

  useEffect(() => {
    refresh();
    const stopRuns = window.electron.onGameRunsChanged(refresh);
    const stopBatch = window.electron.onLibraryBatchComplete(refresh);
    return () => {
      stopRuns();
      stopBatch();
    };
  }, [refresh]);

  const counts = useMemo(() => countCompatibilityFilters(rows ?? []), [rows]);
  const visible = useMemo(
    () => (rows ?? []).filter((row) => matchesCompatibilityFilter(row, filter)),
    [rows, filter]
  );

  const toolText = (tool: CompatibilityToolState | null) => {
    if (!tool) return "–";
    if (tool.failed) return t("games_overview_tool_failed");
    if (tool.mode === "off") return t("games_overview_tool_off");
    if (tool.installed)
      return t(
        tool.mode === "on"
          ? "games_overview_tool_installed_on"
          : "games_overview_tool_installed"
      );
    return "–";
  };

  const open = (row: CompatibilityOverviewRow) =>
    navigate(`/game/${row.shop}/${row.objectId}?options=tools`);

  return (
    <div className="settings-context-panel settings-games-overview">
      <div className="settings-context-panel__group">
        <p className="settings-games-overview__muted">
          {t("games_overview_description")}
        </p>
        <SelectField
          label={t("games_overview_filter")}
          value={filter}
          theme="dark"
          options={COMPATIBILITY_OVERVIEW_FILTERS.map((item) => ({
            key: item,
            value: item,
            label: t(`games_overview_filter_${item}`, { count: counts[item] }),
          }))}
          onChange={(event) =>
            setFilter(event.target.value as CompatibilityOverviewFilter)
          }
        />
      </div>

      {rows === null && (
        <p className="settings-games-overview__muted">
          {t("games_overview_loading")}
        </p>
      )}
      {rows && visible.length === 0 && (
        <p className="settings-games-overview__muted">
          {t("games_overview_empty")}
        </p>
      )}

      {visible.length > 0 && (
        <table className="settings-games-overview__table">
          <thead>
            <tr>
              <th>{t("games_overview_game")}</th>
              <th>{tGame("capability_online_fix")}</th>
              <th>{tGame("capability_renodx")}</th>
              <th>{tGame("capability_optiscaler")}</th>
              <th>{t("games_overview_last_run")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={`${row.shop}-${row.objectId}`}>
                <td>
                  <button
                    type="button"
                    className="settings-games-overview__game"
                    onClick={() => open(row)}
                  >
                    {row.title}
                  </button>
                  {row.updateAvailable && (
                    <small>{t("games_overview_update")}</small>
                  )}
                </td>
                <td>
                  {row.onlineFix
                    ? row.onlineFix.mode === "off"
                      ? t("games_overview_tool_off")
                      : row.onlineFix.active
                        ? t("games_overview_tool_installed")
                        : "–"
                    : "–"}
                </td>
                <td>{toolText(row.renodx)}</td>
                <td>{toolText(row.optiscaler)}</td>
                <td
                  className={
                    row.lastRun && FAILED_OUTCOMES.has(row.lastRun.outcome)
                      ? "settings-games-overview__failed"
                      : undefined
                  }
                >
                  {row.lastRun
                    ? `${tGame(`run_outcome_${row.lastRun.outcome}`)} · ${formatDistance(
                        row.lastRun.startedAt,
                        new Date(),
                        { addSuffix: true }
                      )}`
                    : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="settings-context-panel__group">
        <h3>{t("games_overview_bulk")}</h3>
        <BulkToolActions tool="renodx" />
        <BulkToolActions tool="optiscaler" />
      </div>
    </div>
  );
}
