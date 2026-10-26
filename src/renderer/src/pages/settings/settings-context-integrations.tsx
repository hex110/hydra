import { useTranslation } from "react-i18next";
import { useUserDetails } from "@renderer/hooks";
import { SettingsDebrid } from "./settings-debrid";
import { SettingsRetroAchievements } from "./settings-retroachievements";
import { SettingsEpic } from "./settings-epic";
import { SettingsFloppy } from "./settings-floppy";
import { SettingsHydraAccount } from "./settings-hydra-account";
import { SettingsSteamHistory } from "./settings-steam-history";
import { SettingsSteamGridDb } from "./settings-steamgriddb";

export function SettingsContextIntegrations() {
  const { t } = useTranslation("settings");
  const { userDetails } = useUserDetails();

  return (
    <div className="settings-context-panel">
      <div className="settings-context-panel__group">
        <h3>{t("hydra_account_group")}</h3>
        <p className="settings-context-panel__description">
          {t("hydra_account_group_description")}
        </p>
        <SettingsHydraAccount />
        {userDetails && (
          <>
            <SettingsEpic />
            <SettingsRetroAchievements />
          </>
        )}
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
        <h3>{t("artwork_services")}</h3>
        <SettingsSteamGridDb />
      </div>

      <hr className="settings-context-panel__divider" />

      <div className="settings-context-panel__group">
        <h3>{t("debrid_services")}</h3>
        <SettingsDebrid />
      </div>
    </div>
  );
}
