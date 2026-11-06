import cn from "classnames";

import "./progress-bar.scss";

interface ProgressBarProps {
  now?: number;
  max?: number;
  label: string;
  completed?: boolean;
  /** Both class names set: the caller styles the bar (achievements). */
  trackClassName?: string;
  barClassName?: string;
  size?: "thin" | "small" | "large";
  /** Unknown fraction: a moving segment instead of a fill. */
  indeterminate?: boolean;
  tone?: "default" | "extraction" | "error";
}

export function ProgressBar({
  now = 0,
  max = 1,
  label,
  completed = false,
  trackClassName,
  barClassName,
  size = "small",
  indeterminate = false,
  tone = "default",
}: Readonly<ProgressBarProps>) {
  const fraction = max > 0 ? Math.min(Math.max(now / max, 0), 1) : 0;

  if (trackClassName !== undefined || barClassName !== undefined) {
    return (
      <div className={trackClassName}>
        <div
          className={`${barClassName ?? ""}${completed && barClassName ? ` ${barClassName}--platinum` : ""}`}
          role="progressbar"
          aria-label={label}
          aria-valuenow={now}
          aria-valuemin={0}
          aria-valuemax={max}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "progress-bar",
        `progress-bar--${size}`,
        `progress-bar--${tone}`,
        { "progress-bar--indeterminate": indeterminate }
      )}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={indeterminate ? undefined : now}
    >
      <div
        className="progress-bar__fill"
        style={indeterminate ? undefined : { transform: `scaleX(${fraction})` }}
      />
    </div>
  );
}
