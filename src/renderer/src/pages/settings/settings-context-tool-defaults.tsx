import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type CapabilityDefault,
  CAPABILITY_DEFAULT_MODES,
  CAPABILITY_LAUNCH_RULES,
  capabilityDefaultPatch,
  getCapabilityDefault,
  resolveLaunchRules,
} from "@shared";

import { SegmentedControl } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector } from "@renderer/hooks";
import type { GameCapabilityId } from "@types";

import "./settings-tool-defaults.scss";

/** Every tool Hydra applies, in the order they are set up; Linux-only ones are hidden elsewhere. */
const CAPABILITIES: { id: GameCapabilityId; linuxOnly: boolean }[] = [
  { id: "renodx", linuxOnly: false },
  { id: "optiscaler", linuxOnly: false },
  { id: "online_fix", linuxOnly: true },
  { id: "hdr", linuxOnly: true },
  { id: "hdr_monitor", linuxOnly: true },
  { id: "mangohud", linuxOnly: true },
  { id: "gamemode", linuxOnly: true },
];

export function SettingsContextToolDefaults() {
  const { t } = useTranslation("settings");
  const { t: tGame } = useTranslation("game_details");
  const { updateUserPreferences } = useContext(settingsContext);
  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );
  const isLinux = window.electron.platform === "linux";

  const [wrapperAvailable, setWrapperAvailable] = useState({
    mangohud: false,
    gamemode: false,
  });

  useEffect(() => {
    if (!isLinux) return;
    Promise.all([
      window.electron.isMangohudAvailable().catch(() => false),
      window.electron.isGamemodeAvailable().catch(() => false),
    ]).then(([mangohud, gamemode]) =>
      setWrapperAvailable({ mangohud, gamemode })
    );
  }, [isLinux]);

  const rules = resolveLaunchRules(userPreferences?.launchRules);

  /** Why a row cannot be changed, or null when it can. */
  const unavailableReason = (id: GameCapabilityId) => {
    if (id === "mangohud" || id === "gamemode")
      return wrapperAvailable[id] ? null : "tool_defaults_not_installed";
    const ruleId = CAPABILITY_LAUNCH_RULES[id];
    if (ruleId && !rules.some((rule) => rule.id === ruleId))
      return "tool_defaults_rule_removed";
    return null;
  };

  return (
    <div className="settings-context-panel settings-tool-defaults">
      <div className="settings-context-panel__group">
        <p className="settings-tool-defaults__muted">
          {t("tool_defaults_description")}
        </p>
      </div>

      <ul className="settings-tool-defaults__list">
        {CAPABILITIES.filter(({ linuxOnly }) => isLinux || !linuxOnly).map(
          ({ id }) => {
            const unavailable = unavailableReason(id);
            return (
              <li key={id} className="settings-tool-defaults__row">
                <div className="settings-tool-defaults__text">
                  <strong>{tGame(`capability_${id}`)}</strong>
                  <span className="settings-tool-defaults__muted">
                    {t(`tool_defaults_${id}`)}
                  </span>
                  {unavailable && (
                    <span className="settings-tool-defaults__muted">
                      {t(unavailable)}
                    </span>
                  )}
                </div>
                <SegmentedControl<CapabilityDefault>
                  label={tGame(`capability_${id}`)}
                  value={getCapabilityDefault(id, userPreferences)}
                  disabled={!!unavailable}
                  options={CAPABILITY_DEFAULT_MODES[id].map((mode) => ({
                    value: mode,
                    label: t(`tool_defaults_mode_${mode}`),
                  }))}
                  onChange={(mode) =>
                    updateUserPreferences(
                      capabilityDefaultPatch(id, mode, userPreferences)
                    )
                  }
                />
              </li>
            );
          }
        )}
      </ul>

      <p className="settings-tool-defaults__muted">
        {t("tool_defaults_per_game_hint")}
      </p>
    </div>
  );
}
