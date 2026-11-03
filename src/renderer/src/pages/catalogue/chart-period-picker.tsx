import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { ChartPeriod, ChartPeriodPreset } from "@shared";
import { SelectField } from "@renderer/components";

const PRESETS: ChartPeriodPreset[] = [
  "any",
  "30d",
  "3m",
  "12m",
  "this-year",
  "year",
  "month",
];
const FIRST_YEAR = 1990;

const monthName = (month: number, language: string) =>
  new Date(Date.UTC(2000, month - 1, 1)).toLocaleDateString(language, {
    month: "long",
    timeZone: "UTC",
  });

/** A period in words, e.g. "released in March 2026". */
export const formatPeriod = (
  period: ChartPeriod,
  t: TFunction,
  language: string
) => {
  const year = period.year ?? new Date().getFullYear();
  switch (period.preset) {
    case "year":
      return t("period_in", { when: String(year) });
    case "month":
      return t("period_in", {
        when: `${monthName(period.month ?? 1, language)} ${year}`,
      });
    default:
      return t(`period_scope_${period.preset}`);
  }
};

interface ChartPeriodPickerProps {
  value: ChartPeriod;
  onChange: (period: ChartPeriod) => void;
}

/** Which games a chart covers by release date: a preset, or a year, or a month of a year. */
export function ChartPeriodPicker({
  value,
  onChange,
}: Readonly<ChartPeriodPickerProps>) {
  const { t, i18n } = useTranslation("catalogue");
  const now = new Date();
  const thisYear = now.getFullYear();
  const year = value.year ?? thisYear;
  const month = value.month ?? now.getMonth() + 1;

  const years = Array.from(
    { length: thisYear - FIRST_YEAR + 1 },
    (_, index) => thisYear - index
  );
  // A month of this year can't be in the future.
  const months = Array.from({ length: 12 }, (_, index) => index + 1).filter(
    (entry) => year < thisYear || entry <= now.getMonth() + 1
  );

  return (
    <>
      <SelectField
        theme="dark"
        label={t("period_released")}
        value={value.preset}
        options={PRESETS.map((preset) => ({
          key: preset,
          value: preset,
          label: t(`period_${preset}`),
        }))}
        onChange={(event) => {
          const preset = event.target.value as ChartPeriodPreset;
          onChange(
            preset === "year" || preset === "month"
              ? { preset, year, month }
              : { preset }
          );
        }}
      />
      {(value.preset === "year" || value.preset === "month") && (
        <SelectField
          theme="dark"
          label={t("period_pick_year")}
          value={String(year)}
          options={years.map((entry) => ({
            key: String(entry),
            value: String(entry),
            label: String(entry),
          }))}
          onChange={(event) => {
            const nextYear = Number(event.target.value);
            const latest =
              nextYear < thisYear ? 12 : Math.min(month, now.getMonth() + 1);
            onChange({
              ...value,
              year: nextYear,
              month: Math.min(month, latest),
            });
          }}
        />
      )}
      {value.preset === "month" && (
        <SelectField
          theme="dark"
          label={t("period_pick_month")}
          value={String(month)}
          options={months.map((entry) => ({
            key: String(entry),
            value: String(entry),
            label: monthName(entry, i18n.language),
          }))}
          onChange={(event) =>
            onChange({ ...value, month: Number(event.target.value) })
          }
        />
      )}
    </>
  );
}
