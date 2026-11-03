import { useTranslation } from "react-i18next";
import { SidebarSection } from "@renderer/components/sidebar-section/sidebar-section";
import "./release-year-section.scss";

const MIN_YEAR = 1970;
const MAX_YEAR = new Date().getFullYear();

interface ReleaseYearSectionProps {
  title: string;
  defaultOpen?: boolean;
  value: { gte?: number; lte?: number } | undefined;
  onChange: (value: { gte?: number; lte?: number } | undefined) => void;
}

export function ReleaseYearSection({
  title,
  defaultOpen = false,
  value,
  onChange,
}: Readonly<ReleaseYearSectionProps>) {
  const { t } = useTranslation("catalogue");

  const gte = value?.gte ?? MIN_YEAR;
  const lte = value?.lte ?? MAX_YEAR;
  const isActive = value !== undefined;

  const gtePercent = ((gte - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;
  const ltePercent = ((lte - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;

  const handleGteChange = (newGte: number) => {
    emit(Math.min(newGte, lte), lte);
  };

  const handleLteChange = (newLte: number) => {
    emit(gte, Math.max(newLte, gte));
  };

  const emit = (newGte: number, newLte: number) => {
    const nextGte = newGte === MIN_YEAR ? undefined : newGte;
    const nextLte = newLte === MAX_YEAR ? undefined : newLte;
    onChange(
      nextGte === undefined && nextLte === undefined
        ? undefined
        : { gte: nextGte, lte: nextLte }
    );
  };

  return (
    <SidebarSection title={title} defaultOpen={defaultOpen || isActive}>
      <div className="release-year-section__body">
        {isActive ? (
          <button
            type="button"
            className="release-year-section__clear"
            onClick={() => onChange(undefined)}
          >
            {t("clear_filters", { filterCount: 1 })}
          </button>
        ) : (
          <span className="release-year-section__hint">
            {t("filter_by_release_year")}
          </span>
        )}

        <div className="release-year-section__labels">
          <span>{gte}</span>
          <span>{lte}</span>
        </div>

        <div className="release-year-section__slider-container">
          <div
            className="release-year-section__track"
            style={
              {
                "--year-start": `${gtePercent}%`,
                "--year-end": `${ltePercent}%`,
              } as React.CSSProperties
            }
          />
          <input
            type="range"
            min={MIN_YEAR}
            max={MAX_YEAR}
            value={gte}
            onChange={(e) => handleGteChange(Number(e.target.value))}
            className="release-year-section__range"
            style={{ zIndex: gte === MAX_YEAR ? 2 : 1 }}
            aria-label={t("release_year_gte")}
          />
          <input
            type="range"
            min={MIN_YEAR}
            max={MAX_YEAR}
            value={lte}
            onChange={(e) => handleLteChange(Number(e.target.value))}
            className="release-year-section__range"
            style={{ zIndex: gte === MAX_YEAR ? 1 : 2 }}
            aria-label={t("release_year_lte")}
          />
        </div>
      </div>
    </SidebarSection>
  );
}
