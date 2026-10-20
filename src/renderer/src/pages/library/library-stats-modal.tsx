import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toPlayActivityDate } from "@shared";
import type { LibraryGame, PlayActivityEntry } from "@types";
import { Modal } from "@renderer/components";
import { useFormat, useGameCard } from "@renderer/hooks";
import { isGameReadyToPlay } from "@renderer/helpers";
import { getLibraryStats, getPlayTimeByMonth } from "./library-stats";
import "./library-stats-modal.scss";

const MONTHS = 12;
const STATUSES = ["playing", "backlog", "finished", "dropped", "none"] as const;
const noop = () => {};

interface LibraryStatsModalProps {
  visible: boolean;
  games: LibraryGame[];
  onClose: () => void;
}

function Bars({
  items,
  format,
}: Readonly<{
  items: { label: string; value: number }[];
  format: (value: number) => string;
}>) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ul className="library-stats__bars">
      {items.map((item) => (
        <li key={item.label} className="library-stats__bar-row">
          <span className="library-stats__bar-label" title={item.label}>
            {item.label}
          </span>
          <span className="library-stats__bar-track">
            <span
              className="library-stats__bar"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </span>
          <span className="library-stats__bar-value">{format(item.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Library-wide numbers from the library and the recorded play activity. */
export function LibraryStatsModal({
  visible,
  games,
  onClose,
}: Readonly<LibraryStatsModalProps>) {
  const { t, i18n } = useTranslation("library");
  const { numberFormatter } = useFormat();
  const { formatPlayTime } = useGameCard(games[0] ?? ({} as LibraryGame), noop);
  const [activity, setActivity] = useState<PlayActivityEntry[]>([]);

  useEffect(() => {
    if (!visible) return;
    const since = new Date();
    since.setMonth(since.getMonth() - MONTHS, 1);
    window.electron
      .getPlayActivity(toPlayActivityDate(since))
      .then(setActivity)
      .catch(() => setActivity([]));
  }, [visible]);

  const stats = useMemo(
    () => getLibraryStats(games, isGameReadyToPlay),
    [games]
  );
  const months = useMemo(
    () => getPlayTimeByMonth(activity, new Date(), MONTHS),
    [activity]
  );
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { month: "short" }),
    [i18n.language]
  );
  const maxMonth = Math.max(1, ...months.map((month) => month.playTime));
  const hours = (ms: number) => formatPlayTime(ms, true);

  const tiles = [
    { label: t("stats_games"), value: numberFormatter.format(stats.gameCount) },
    {
      label: t("stats_installed"),
      value: numberFormatter.format(stats.installedCount),
    },
    {
      label: t("stats_played"),
      value: numberFormatter.format(stats.playedCount),
    },
    { label: t("stats_total_playtime"), value: hours(stats.totalPlayTime) },
    {
      label: t("stats_completion"),
      value:
        stats.completionRate === null
          ? "–"
          : `${Math.round(stats.completionRate * 100)}%`,
    },
  ];

  return (
    <Modal
      visible={visible}
      title={t("stats_title")}
      description={t("stats_description")}
      onClose={onClose}
      large
    >
      <div className="library-stats">
        <div className="library-stats__tiles">
          {tiles.map((tile) => (
            <div key={tile.label} className="library-stats__tile">
              <span className="library-stats__tile-value">{tile.value}</span>
              <span className="library-stats__tile-label">{tile.label}</span>
            </div>
          ))}
        </div>

        <section className="library-stats__section">
          <h3>{t("stats_by_month")}</h3>
          <div className="library-stats__months">
            {months.map((month) => {
              const [year, monthNumber] = month.month.split("-").map(Number);
              const label = monthFormatter.format(
                new Date(year, monthNumber - 1, 1)
              );
              return (
                <div
                  key={month.month}
                  className="library-stats__month"
                  title={`${label} ${year}: ${hours(month.playTime)}`}
                >
                  <span className="library-stats__month-track">
                    <span
                      className="library-stats__month-bar"
                      style={{
                        height: `${(month.playTime / maxMonth) * 100}%`,
                      }}
                    />
                  </span>
                  <span className="library-stats__month-label">{label}</span>
                </div>
              );
            })}
          </div>
          <p className="library-stats__note">{t("stats_by_month_note")}</p>
        </section>

        <div className="library-stats__columns">
          <section className="library-stats__section">
            <h3>{t("stats_by_status")}</h3>
            <Bars
              items={STATUSES.map((status) => ({
                label: t(`play_status_${status}`),
                value: stats.statusCounts[status],
              }))}
              format={(value) => numberFormatter.format(value)}
            />
          </section>

          <section className="library-stats__section">
            <h3>{t("stats_by_genre")}</h3>
            {stats.playTimeByGenre.length > 0 ? (
              <Bars
                items={stats.playTimeByGenre.map((item) => ({
                  label: item.genre,
                  value: item.playTime,
                }))}
                format={hours}
              />
            ) : (
              <p className="library-stats__note">{t("stats_no_genres")}</p>
            )}
          </section>

          <section className="library-stats__section">
            <h3>{t("stats_most_played")}</h3>
            <Bars
              items={stats.mostPlayed.map((item) => ({
                label: item.title,
                value: item.playTime,
              }))}
              format={hours}
            />
          </section>
        </div>
      </div>
    </Modal>
  );
}
