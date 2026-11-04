import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import cn from "classnames";

import { CheckboxField, SelectField } from "@renderer/components";
import { useDate } from "@renderer/hooks";
import { logger } from "@renderer/logger";
import type { GameShop, ModActivityEntry } from "@types";

const ALL = "__all__";

/** The game's activity log, newest first, filterable by mod. */
export function ModActivity({
  shop,
  objectId,
}: Readonly<{ shop: GameShop; objectId: string }>) {
  const { t } = useTranslation("mods");
  const { formatDateTime } = useDate();
  const [entries, setEntries] = useState<ModActivityEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [modFilter, setModFilter] = useState(ALL);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      setEntries(await window.electron.getModActivity(shop, objectId));
      setFailed(false);
    } catch (error) {
      logger.error("Failed to load the mod activity log", error);
      setFailed(true);
    }
  }, [shop, objectId]);

  useEffect(() => {
    void load();
    return window.electron.onModActivityChanged((changedShop, changedId) => {
      if (changedShop === shop && changedId === objectId) void load();
    });
  }, [shop, objectId, load]);

  const modNames = useMemo(
    () =>
      [
        ...new Set(
          (entries ?? []).flatMap((entry) =>
            entry.modName ? [entry.modName] : []
          )
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [entries]
  );

  const shown = useMemo(
    () =>
      (entries ?? [])
        .map((entry, index) => ({ entry, index }))
        .filter(
          ({ entry }) =>
            (modFilter === ALL || entry.modName === modFilter) &&
            (!errorsOnly ||
              entry.kind === "error" ||
              entry.kind === "download-failed")
        )
        .reverse(),
    [entries, modFilter, errorsOnly]
  );

  if (failed)
    return <p className="mods__notice">{t("activity_load_failed")}</p>;
  if (entries === null) return <p className="mods__hint">{t("loading")}</p>;
  if (entries.length === 0)
    return <p className="mods__empty">{t("activity_empty")}</p>;

  const toggle = (index: number) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <div className="mods__activity">
      <div className="mods__activity-filters">
        <SelectField
          theme="dark"
          value={modFilter}
          onChange={(event) => setModFilter(event.target.value)}
          options={[
            { key: ALL, value: ALL, label: t("activity_all_mods") },
            ...modNames.map((name) => ({
              key: name,
              value: name,
              label: name,
            })),
          ]}
        />
        <CheckboxField
          label={t("activity_errors_only")}
          checked={errorsOnly}
          onChange={() => setErrorsOnly((value) => !value)}
        />
      </div>
      {shown.length === 0 ? (
        <p className="mods__hint">{t("activity_none_match")}</p>
      ) : (
        <ol className="mods__activity-list">
          {shown.map(({ entry, index }) => {
            const isError =
              entry.kind === "error" || entry.kind === "download-failed";
            return (
              <li
                key={index}
                className={cn("mods__activity-entry", {
                  "mods__activity-entry--error": isError,
                })}
              >
                <div className="mods__activity-head">
                  <span className="mods__activity-kind">
                    {t(`activity_kind_${entry.kind.replaceAll("-", "_")}`)}
                  </span>
                  {entry.modName && <strong>{entry.modName}</strong>}
                  <time className="mods__activity-time" dateTime={entry.at}>
                    {formatDateTime(entry.at)}
                  </time>
                </div>
                <p className="mods__activity-message">{entry.message}</p>
                {entry.details && (
                  <>
                    <button
                      type="button"
                      className="mods__link"
                      aria-expanded={expanded.has(index)}
                      onClick={() => toggle(index)}
                    >
                      {expanded.has(index)
                        ? t("activity_hide_details")
                        : t("activity_show_details")}
                    </button>
                    {expanded.has(index) && (
                      <pre className="mods__activity-details">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
