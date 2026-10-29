import cn from "classnames";

import "./segmented-control.scss";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  options: SegmentedControlOption<T>[];
  onChange: (value: T) => void;
  /** Names the group for screen readers. */
  label: string;
  disabled?: boolean;
}

/** A small set of mutually exclusive choices shown side by side. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled = false,
}: Readonly<SegmentedControlProps<T>>) {
  return (
    <div className="segmented-control" role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            className={cn("segmented-control__option", {
              "segmented-control__option--selected": selected,
            })}
            onClick={() => {
              if (!selected) onChange(option.value);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
