import { useState } from "react";
import cn from "classnames";
import { StarFillIcon, StarIcon } from "@primer/octicons-react";
import "./rating-input.scss";

export interface RatingInputProps {
  value: number | null;
  /** Called with the new rating, or null when the current one is clicked again. */
  onChange: (value: number | null) => void;
  label: string;
  max?: number;
  disabled?: boolean;
}

/** A row of stars that sets a whole-number rating out of `max`. */
export function RatingInput({
  value,
  onChange,
  label,
  max = 10,
  disabled,
}: Readonly<RatingInputProps>) {
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? value ?? 0;

  return (
    <div className="rating-input" role="radiogroup" aria-label={label}>
      {Array.from({ length: max }, (_, index) => index + 1).map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={star === value}
          aria-label={`${star} / ${max}`}
          disabled={disabled}
          className={cn("rating-input__star", {
            "rating-input__star--active": star <= shown,
          })}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setHovered(star)}
          onBlur={() => setHovered(null)}
          onClick={() => onChange(star === value ? null : star)}
        >
          {star <= shown ? <StarFillIcon size={14} /> : <StarIcon size={14} />}
        </button>
      ))}

      {value !== null && (
        <span className="rating-input__value">
          {value}/{max}
        </span>
      )}
    </div>
  );
}
