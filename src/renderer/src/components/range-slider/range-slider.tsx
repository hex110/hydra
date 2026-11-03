import "./range-slider.scss";

export interface RangeSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Names the slider for screen readers. */
  label: string;
  /** Words at the two ends, e.g. "Older" and "Newer". */
  startLabel?: string;
  endLabel?: string;
}

/** One value on a scale between two named ends. */
export function RangeSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  startLabel,
  endLabel,
}: Readonly<RangeSliderProps>) {
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div className="range-slider">
      <input
        type="range"
        className="range-slider__input"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        style={{ "--range-slider-fill": `${percent}%` } as React.CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {(startLabel || endLabel) && (
        <div className="range-slider__ends">
          <span>{startLabel}</span>
          <span>{endLabel}</span>
        </div>
      )}
    </div>
  );
}
