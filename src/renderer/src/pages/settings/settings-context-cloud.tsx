import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@renderer/components";
import { useAppSelector } from "@renderer/hooks";

import { SettingsCloudLibrary } from "./settings-cloud-library";
import { CloudR2GuideModal } from "./settings-cloud-r2-guide";
import { SettingsCloudStorage } from "./settings-cloud-storage";
import { SettingsSaveSync } from "./settings-save-sync";
import "./settings-cloud.scss";

const HOW_IT_WORKS_KEYS = [
  "cloud_how_backup",
  "cloud_how_library",
  "cloud_how_devices",
  "cloud_how_conflicts",
  "cloud_how_private",
  "cloud_how_per_game",
] as const;

export function SettingsContextCloud() {
  const { t } = useTranslation("settings");
  const [isR2GuideVisible, setIsR2GuideVisible] = useState(false);
  const hasStore = useAppSelector((state) =>
    Boolean(state.userPreferences.value?.saveStore)
  );

  return (
    <div className="settings-context-panel settings-cloud">
      <p className="settings-cloud__muted">{t("cloud_description")}</p>

      <div className="settings-context-panel__group">
        <SettingsSaveSync onOpenR2Guide={() => setIsR2GuideVisible(true)} />
      </div>

      {hasStore && (
        <>
          <div className="settings-context-panel__group">
            <SettingsCloudLibrary />
          </div>

          <div className="settings-context-panel__group">
            <SettingsCloudStorage />
          </div>
        </>
      )}

      <hr className="settings-context-panel__divider" />

      <div className="settings-context-panel__group">
        <h3>{t("cloud_guides")}</h3>
        <div className="settings-cloud__guide">
          <div>
            <h4>{t("cloud_r2_guide_card_title")}</h4>
            <p className="settings-cloud__muted">
              {t("cloud_r2_guide_card_description")}
            </p>
          </div>
          <Button theme="outline" onClick={() => setIsR2GuideVisible(true)}>
            {t("cloud_r2_guide_open")}
          </Button>
        </div>
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("cloud_how_it_works")}</h3>
        <ul className="settings-cloud__facts">
          {HOW_IT_WORKS_KEYS.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </div>

      <CloudR2GuideModal
        visible={isR2GuideVisible}
        onClose={() => setIsR2GuideVisible(false)}
      />
    </div>
  );
}
