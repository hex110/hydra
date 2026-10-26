import { useTranslation } from "react-i18next";
import type { SteamGameHistory } from "@types";
import { useDate } from "@renderer/hooks";

const formatMinutes = (minutes: number) =>
  `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

/** What Steam itself reports for the game: playtime, last played, achievement dates. */
export function SteamHistorySection({
  history,
}: Readonly<{ history: SteamGameHistory | null }>) {
  const { t } = useTranslation("game_details");
  const { formatDateTime } = useDate();

  if (!history || history.playtimeMinutes === 0) return null;

  const achievements = history.achievements ?? [];
  const unlocked = achievements
    .filter((item) => item.unlockTime !== null)
    .sort((a, b) => (b.unlockTime ?? 0) - (a.unlockTime ?? 0));

  return (
    <div className="your-stuff__list">
      <h3>{t("steam_history_title")}</h3>
      <ul>
        <li>
          <span>{t("steam_history_playtime")}</span>
          <span>
            {formatMinutes(history.playtimeMinutes)}
            {history.playtimeLinuxMinutes > 0 &&
              ` · ${t("steam_history_on_linux", { time: formatMinutes(history.playtimeLinuxMinutes) })}`}
            {history.playtimeDeckMinutes > 0 &&
              ` · ${t("steam_history_on_deck", { time: formatMinutes(history.playtimeDeckMinutes) })}`}
          </span>
        </li>
        {history.lastPlayedAt && (
          <li>
            <span>{t("steam_history_last_played")}</span>
            <span>{formatDateTime(history.lastPlayedAt * 1000)}</span>
          </li>
        )}
        {achievements.length > 0 && (
          <li>
            <span>{t("steam_history_achievements")}</span>
            <span>
              {unlocked.length} / {achievements.length}
            </span>
          </li>
        )}
      </ul>

      {unlocked.length > 0 && (
        <details>
          <summary>{t("steam_history_unlock_dates")}</summary>
          <ul className="your-stuff__achievements">
            {unlocked.map((item) => (
              <li key={item.apiName}>
                <span title={item.description ?? undefined}>
                  {item.displayName ?? item.apiName}
                </span>
                <span>{formatDateTime((item.unlockTime ?? 0) * 1000)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
