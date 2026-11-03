import type { ReactNode } from "react";
import cn from "classnames";

import "./tab-strip.scss";

export interface TabStripOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export interface TabStripProps<T extends string> {
  value: T;
  options: TabStripOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

/** The page-level tabs: the library's sources, the catalogue's Discover, Charts, Browse. */
export function TabStrip<T extends string>({
  value,
  options,
  onChange,
  className,
}: Readonly<TabStripProps<T>>) {
  return (
    <div className={cn("tab-strip", className)} role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={cn("tab-strip__option", {
            "tab-strip__option--active": value === option.value,
          })}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
