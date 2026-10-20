import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryGame, PlayActivityEntry } from "@types";
import {
  buildPlayHeatmap,
  getMostPlayedInActivity,
  getPlayActivityTotal,
  getPlayStreaks,
  getPlayTimeHoursAndMinutes,
  parsePlayActivityDate,
  toPlayActivityDate,
} from "@shared";
import { useDate } from "@renderer/hooks";
import flameIconStatic from "@renderer/assets/icons/flame-static.png";
import { HEATMAP_WEEKS } from "./use-play-activity";
import "./play-activity-panel.scss";

interface PlayActivityPanelProps {
  entries: PlayActivityEntry[];
  library: LibraryGame[];
}

export function PlayActivityPanel({
  entries,
  library,
}: Readonly<PlayActivityPanelProps>) {
  const { t } = useTranslation("home");
  const { formatDate } = useDate();

  const formatDuration = (milliseconds: number) => {
    const { hours, minutes } = getPlayTimeHoursAndMinutes(milliseconds);
    return hours > 0
      ? t("duration_hours_minutes", { hours, minutes })
      : t("duration_minutes", { minutes });
  };

  const heatmap = useMemo(
    () => buildPlayHeatmap(entries, HEATMAP_WEEKS),
    [entries]
  );
  const streaks = useMemo(() => getPlayStreaks(entries), [entries]);

  const weekStart = heatmap[heatmap.length - 1][0].date;
  const thisWeekMs = entries
    .filter((entry) => entry.date >= weekStart)
    .reduce((sum, entry) => sum + getPlayActivityTotal(entry), 0);

  const monthStart = toPlayActivityDate(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [topThisMonth] = getMostPlayedInActivity(
    entries.filter((entry) => entry.date >= monthStart)
  );
  const topGame = topThisMonth
    ? library.find((game) => game.id === topThisMonth[0])
    : undefined;

  const monthLabels = heatmap.map((week, index) => {
    const first = parsePlayActivityDate(week[0].date);
    const previous =
      index > 0 ? parsePlayActivityDate(heatmap[index - 1][0].date) : null;
    return !previous || previous.getMonth() !== first.getMonth()
      ? first.toLocaleDateString(undefined, { month: "short" })
      : "";
  });

  return (
    <section className="play-activity">
      <div className="play-activity__stats">
        <div
          className={`play-activity__streak${streaks.current > 0 ? " play-activity__streak--active" : ""}`}
        >
          <img src={flameIconStatic} alt="" className="play-activity__flame" />
          <div>
            <p className="play-activity__streak-count">
              {t("streak_days", { count: streaks.current })}
            </p>
            <p className="play-activity__hint">
              {streaks.current > 0 && !streaks.playedToday
                ? t("streak_play_today")
                : t("streak_longest", { count: streaks.longest })}
            </p>
          </div>
        </div>

        <div className="play-activity__stat">
          <p className="play-activity__stat-value">
            {formatDuration(thisWeekMs)}
          </p>
          <p className="play-activity__hint">{t("played_this_week")}</p>
        </div>

        {topGame && topThisMonth && (
          <div className="play-activity__stat">
            <p className="play-activity__stat-value">{topGame.title}</p>
            <p className="play-activity__hint">
              {t("most_played_this_month", {
                duration: formatDuration(topThisMonth[1]),
              })}
            </p>
          </div>
        )}
      </div>

      <div className="play-activity__heatmap" aria-label={t("play_activity")}>
        <div className="play-activity__months" aria-hidden="true">
          {monthLabels.map((label, index) => (
            <span key={heatmap[index][0].date}>{label}</span>
          ))}
        </div>
        <div className="play-activity__grid">
          {heatmap.map((week) => (
            <div key={week[0].date} className="play-activity__week">
              {week.map((cell) => (
                <span
                  key={cell.date}
                  className={`play-activity__day play-activity__day--level-${cell.level}${cell.isFuture ? " play-activity__day--future" : ""}`}
                  title={
                    cell.isFuture
                      ? undefined
                      : `${formatDate(parsePlayActivityDate(cell.date))}: ${
                          cell.totalMs > 0
                            ? formatDuration(cell.totalMs)
                            : t("no_play")
                        }`
                  }
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
