import { useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getHardwareModels } from "@shared";
import type { SystemSpecsOverrides } from "@types";

import { Button, ComboboxField } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector, useSystemSpecs } from "@renderer/hooks";

import "./settings-my-pc.scss";

const RAM_SIZES_GB = [2, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256];

type Part = "cpu" | "gpu";

export function SettingsContextMyPc() {
  const { t } = useTranslation("settings");
  const { updateUserPreferences } = useContext(settingsContext);
  const overrides = useAppSelector(
    (state) => state.userPreferences.value?.systemSpecs
  );
  const { loading, detected, specs } = useSystemSpecs();

  const modelOptions = useMemo(
    () => ({
      cpu: [...getHardwareModels("cpu")].sort((a, b) => b.score - a.score),
      gpu: [...getHardwareModels("gpu")].sort((a, b) => b.score - a.score),
    }),
    []
  );

  const save = (patch: Partial<SystemSpecsOverrides>) =>
    updateUserPreferences({ systemSpecs: { ...overrides, ...patch } });

  const ramOptions = [...new Set([...RAM_SIZES_GB, specs.ramGb ?? 0])]
    .filter((size) => size > 0)
    .sort((a, b) => a - b);

  const partRow = (part: Part) => {
    const key = part === "cpu" ? "cpuId" : "gpuId";
    const source = part === "cpu" ? specs.cpuSource : specs.gpuSource;
    const modelId = part === "cpu" ? specs.cpuId : specs.gpuId;
    const detectedName = part === "cpu" ? detected?.cpuName : detected?.gpuName;
    const edited = source === "edited";

    return (
      <li key={part} className="settings-my-pc__row">
        <div className="settings-my-pc__text">
          <strong>{t(`my_pc_${part}`)}</strong>
          <span className="settings-my-pc__muted">
            {edited
              ? t("my_pc_edited")
              : detectedName
                ? t("my_pc_detected", { name: detectedName })
                : t("my_pc_not_detected")}
          </span>
          {part === "gpu" && specs.gpuAmbiguous && (
            <span className="settings-my-pc__muted">
              {t("my_pc_gpu_ambiguous")}
            </span>
          )}
          {!edited && detectedName && !modelId && (
            <span className="settings-my-pc__muted">
              {t("my_pc_not_in_table")}
            </span>
          )}
        </div>
        <div className="settings-my-pc__controls">
          <ComboboxField
            label={t(`my_pc_${part}`)}
            value={modelId}
            placeholder={t("my_pc_choose")}
            noResultsLabel={t("my_pc_no_match")}
            options={modelOptions[part].map((model) => ({
              value: model.id,
              label: model.name,
            }))}
            onChange={(id) => save({ [key]: id })}
          />
          {edited && (
            <Button theme="outline" onClick={() => save({ [key]: null })}>
              {t("my_pc_reset")}
            </Button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="settings-context-panel settings-my-pc">
      <div className="settings-context-panel__group">
        <p className="settings-my-pc__muted">{t("my_pc_description")}</p>
      </div>

      {loading ? (
        <p className="settings-my-pc__muted">{t("my_pc_loading")}</p>
      ) : (
        <ul className="settings-my-pc__list">
          {partRow("cpu")}
          {partRow("gpu")}
          <li className="settings-my-pc__row">
            <div className="settings-my-pc__text">
              <strong>{t("my_pc_ram")}</strong>
              <span className="settings-my-pc__muted">
                {specs.ramSource === "edited"
                  ? t("my_pc_edited")
                  : detected?.ramGb
                    ? t("my_pc_detected", {
                        name: t("my_pc_ram_value", { count: detected.ramGb }),
                      })
                    : t("my_pc_not_detected")}
              </span>
            </div>
            <div className="settings-my-pc__controls">
              <ComboboxField
                label={t("my_pc_ram")}
                value={specs.ramGb ? String(specs.ramGb) : null}
                placeholder={t("my_pc_choose")}
                noResultsLabel={t("my_pc_no_match")}
                options={ramOptions.map((size) => ({
                  value: String(size),
                  label: t("my_pc_ram_value", { count: size }),
                }))}
                onChange={(size) => save({ ramGb: Number(size) })}
              />
              {specs.ramSource === "edited" && (
                <Button theme="outline" onClick={() => save({ ramGb: null })}>
                  {t("my_pc_reset")}
                </Button>
              )}
            </div>
          </li>
        </ul>
      )}

      <p className="settings-my-pc__muted">{t("my_pc_closest_hint")}</p>
    </div>
  );
}
