import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { CheckboxField } from "../checkbox-field/checkbox-field";
import { SelectField } from "../select-field/select-field";
import { TextField } from "../text-field/text-field";
import { MANGOHUD_METRICS } from "@shared";
import type { MangoHudPosition, MangoHudSettings } from "@types";

import "./mangohud-editor.scss";

const POSITIONS: MangoHudPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

export interface MangoHudEditorProps {
  value: MangoHudSettings;
  onChange: (value: MangoHudSettings) => void;
}

/** Edits a MangoHud layout. Text fields save when they lose focus. */
export function MangoHudEditor({
  value,
  onChange,
}: Readonly<MangoHudEditorProps>) {
  const { t } = useTranslation("settings");
  const [fpsLimit, setFpsLimit] = useState(String(value.fpsLimit ?? ""));
  const [extra, setExtra] = useState(value.extra);

  useEffect(() => setFpsLimit(String(value.fpsLimit ?? "")), [value.fpsLimit]);
  useEffect(() => setExtra(value.extra), [value.extra]);

  const toggleMetric = (metric: string) =>
    onChange({
      ...value,
      metrics: value.metrics.includes(metric)
        ? value.metrics.filter((item) => item !== metric)
        : [...value.metrics, metric],
    });

  return (
    <div className="mangohud-editor">
      <div className="mangohud-editor__row">
        <SelectField
          label={t("mangohud_position")}
          value={value.position}
          theme="dark"
          options={POSITIONS.map((position) => ({
            key: position,
            value: position,
            label: t(`mangohud_position_${position.replace("-", "_")}`),
          }))}
          onChange={(event) =>
            onChange({
              ...value,
              position: event.target.value as MangoHudPosition,
            })
          }
        />
        <TextField
          type="number"
          min="0"
          label={t("mangohud_fps_limit")}
          placeholder={t("mangohud_fps_unlimited")}
          value={fpsLimit}
          theme="dark"
          onChange={(event) => setFpsLimit(event.target.value)}
          onBlur={() => {
            const parsed = Number.parseInt(fpsLimit, 10);
            onChange({
              ...value,
              fpsLimit: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
            });
          }}
        />
      </div>

      <span className="mangohud-editor__label">{t("mangohud_metrics")}</span>
      <div className="mangohud-editor__metrics">
        {MANGOHUD_METRICS.map((metric) => (
          <CheckboxField
            key={metric}
            label={t(`mangohud_metric_${metric}`)}
            checked={value.metrics.includes(metric)}
            onChange={() => toggleMetric(metric)}
          />
        ))}
      </div>

      <CheckboxField
        label={t("mangohud_horizontal")}
        checked={value.horizontal}
        onChange={() => onChange({ ...value, horizontal: !value.horizontal })}
      />
      <CheckboxField
        label={t("mangohud_show_upscaler")}
        checked={value.showUpscaler}
        onChange={() =>
          onChange({ ...value, showUpscaler: !value.showUpscaler })
        }
      />
      <p className="mangohud-editor__hint">
        {t("mangohud_show_upscaler_hint")}
      </p>

      <label className="mangohud-editor__label" htmlFor="mangohud-extra">
        {t("mangohud_extra")}
      </label>
      <textarea
        id="mangohud-extra"
        className="mangohud-editor__extra"
        rows={3}
        value={extra}
        placeholder="background_alpha=0.4"
        onChange={(event) => setExtra(event.target.value)}
        onBlur={() => onChange({ ...value, extra })}
      />
    </div>
  );
}
