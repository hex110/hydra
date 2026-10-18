import { useContext } from "react";
import { useTranslation } from "react-i18next";

import { CheckboxField, MangoHudEditor } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector } from "@renderer/hooks";
import { DEFAULT_MANGOHUD_SETTINGS } from "@shared";

export function SettingsMangoHud() {
  const { t } = useTranslation("settings");
  const { updateUserPreferences } = useContext(settingsContext);
  const mangoHud = useAppSelector(
    (state) => state.userPreferences.value?.mangoHud ?? null
  );

  return (
    <div className="settings-context-panel__group">
      <h3>{t("mangohud_layout")}</h3>
      <p className="settings-general__common-redist-description">
        {t("mangohud_layout_description")}
      </p>
      <CheckboxField
        label={t("mangohud_use_hydra_layout")}
        checked={mangoHud !== null}
        onChange={() =>
          updateUserPreferences({
            mangoHud: mangoHud ? null : DEFAULT_MANGOHUD_SETTINGS,
          })
        }
      />
      {mangoHud && (
        <MangoHudEditor
          value={mangoHud}
          onChange={(value) => updateUserPreferences({ mangoHud: value })}
        />
      )}
    </div>
  );
}
