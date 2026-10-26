import { useTranslation } from "react-i18next";
import { SettingsDebrid } from "./settings-debrid";
import { SettingsRetroAchievements } from "./settings-retroachievements";
import { SettingsSteam } from "./settings-steam";
import { SettingsEpic } from "./settings-epic";
import { SettingsFloppy } from "./settings-floppy";
import { SettingsSteamHistory } from "./settings-steam-history";

export function SettingsContextIntegrations() {
  const { t } = useTranslation("settings");

  return (
    <div className="settings-context-panel">
      <div className="settings-context-panel__group">
        <SettingsSteam />
        <SettingsEpic />
        <SettingsRetroAchievements />
      </div>

      <hr className="settings-context-panel__divider" />

      <div className="settings-context-panel__group">
        <h3>{t("play_tracking")}</h3>
        <p className="settings-context-panel__description">
          {t("play_tracking_description")}
        </p>
        <SettingsSteamHistory />
        <SettingsFloppy />
      </div>

      <hr className="settings-context-panel__divider" />

      <div className="settings-context-panel__group">
        <h3>{t("debrid_services")}</h3>
        <SettingsDebrid />
      </div>
    </div>
  );
}
