import { useTranslation } from "react-i18next";

import { CheckboxField, SelectField, TextField } from "@renderer/components";
import type {
  GamescopeSettings,
  LaunchRuleActions,
  ProtonVersion,
} from "@types";

const numberOrNull = (value: string) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const GAMESCOPE_SIZE_FIELDS = [
  ["width", "launch_rules_gamescope_width", "3440"],
  ["height", "launch_rules_gamescope_height", "1440"],
  ["gameWidth", "launch_rules_gamescope_game_width", "2560"],
  ["gameHeight", "launch_rules_gamescope_game_height", "1080"],
  ["fpsLimit", "launch_rules_gamescope_fps_limit", "120"],
] as const;

/** Proton, MangoHud, GameMode and gamescope choices of one launch rule. */
export function LaunchRuleActionsEditor({
  actions,
  protonVersions,
  onChange,
}: Readonly<{
  actions: LaunchRuleActions | undefined;
  protonVersions: ProtonVersion[];
  onChange: (actions: LaunchRuleActions) => void;
}>) {
  const { t } = useTranslation("settings");
  const current = actions ?? {};
  const gamescope = current.gamescope ?? null;

  const setGamescope = (changes: Partial<GamescopeSettings>) =>
    onChange({ ...current, gamescope: { ...gamescope, ...changes } });

  const protonValue = current.proton ?? "";
  const protonOptions = [
    { key: "none", value: "", label: t("launch_rules_proton_none") },
    {
      key: "ge",
      value: "ge-proton:latest",
      label: t("launch_rules_proton_latest", { name: "GE-Proton" }),
    },
    {
      key: "cachyos",
      value: "proton-cachyos:latest",
      label: t("launch_rules_proton_latest", { name: "Proton-CachyOS" }),
    },
    ...protonVersions.map((version) => ({
      key: version.path,
      value: version.path,
      label: version.name,
    })),
  ];
  if (protonValue && !protonOptions.some((o) => o.value === protonValue)) {
    protonOptions.push({
      key: protonValue,
      value: protonValue,
      label: t("launch_rules_proton_missing", { path: protonValue }),
    });
  }

  return (
    <details className="settings-launch-rules__actions-editor">
      <summary>{t("launch_rules_more_actions")}</summary>

      <SelectField
        label={t("launch_rules_proton")}
        theme="dark"
        value={protonValue}
        options={protonOptions}
        onChange={(event) =>
          onChange({ ...current, proton: event.target.value || null })
        }
      />
      <p className="settings-launch-rules__muted">
        {t("launch_rules_proton_hint")}
      </p>

      <CheckboxField
        label={t("launch_rules_mangohud")}
        checked={current.mangohud === true}
        onChange={() => onChange({ ...current, mangohud: !current.mangohud })}
      />
      <CheckboxField
        label={t("launch_rules_gamemode")}
        checked={current.gamemode === true}
        onChange={() => onChange({ ...current, gamemode: !current.gamemode })}
      />

      <CheckboxField
        label={t("launch_rules_gamescope")}
        checked={gamescope !== null}
        onChange={() =>
          onChange({
            ...current,
            gamescope: gamescope ? null : { fullscreen: true },
          })
        }
      />
      {gamescope && (
        <>
          <div className="settings-launch-rules__gamescope">
            {GAMESCOPE_SIZE_FIELDS.map(([field, label, placeholder]) => (
              <TextField
                key={field}
                type="number"
                min="0"
                theme="dark"
                label={t(label)}
                placeholder={placeholder}
                value={String(gamescope[field] ?? "")}
                onChange={(event) =>
                  setGamescope({ [field]: numberOrNull(event.target.value) })
                }
              />
            ))}
          </div>
          <CheckboxField
            label={t("launch_rules_gamescope_fullscreen")}
            checked={gamescope.fullscreen === true}
            onChange={() => setGamescope({ fullscreen: !gamescope.fullscreen })}
          />
          <CheckboxField
            label={t("launch_rules_gamescope_hdr")}
            checked={gamescope.hdr === true}
            onChange={() => setGamescope({ hdr: !gamescope.hdr })}
          />
          <TextField
            theme="dark"
            label={t("launch_rules_gamescope_extra")}
            placeholder="--adaptive-sync"
            value={gamescope.extraArgs ?? ""}
            onChange={(event) =>
              setGamescope({ extraArgs: event.target.value })
            }
          />
        </>
      )}
    </details>
  );
}
