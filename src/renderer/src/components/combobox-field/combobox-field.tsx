import { useEffect, useId, useMemo, useRef, useState } from "react";
import cn from "classnames";

import { TextField } from "@renderer/components/text-field/text-field";
import "./combobox-field.scss";

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxFieldProps {
  /** Names the field for screen readers. */
  label: string;
  value: string | null;
  options: ComboboxOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** Shown when nothing matches what was typed. */
  noResultsLabel: string;
  disabled?: boolean;
}

/** Spaces and dashes are ignored, so "9070xt" finds "RX 9070 XT". */
const compact = (text: string) => text.toLowerCase().replace(/[\s\-_]+/g, "");

/** A field that filters a long list as you type; pick with the mouse or the arrow keys and Enter. */
export function ComboboxField({
  label,
  value,
  options,
  onChange,
  placeholder,
  noResultsLabel,
  disabled,
}: Readonly<ComboboxFieldProps>) {
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = options.find((option) => option.value === value) ?? null;

  const matches = useMemo(() => {
    const needles = query.split(/\s+/).map(compact).filter(Boolean);
    if (needles.length === 0) return options;
    return options.filter((option) => {
      const haystack = compact(option.label);
      return needles.every((needle) => haystack.includes(needle));
    });
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const choose = (option: ComboboxOption) => {
    onChange(option.value);
    close();
  };

  const optionId = (index: number) => `${listId}-${index}`;

  return (
    <div className="combobox-field">
      <TextField
        theme="dark"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && matches.length ? optionId(activeIndex) : undefined
        }
        autoComplete="off"
        disabled={disabled}
        value={open ? query : (selected?.label ?? "")}
        // While searching, the current choice stays visible as the hint.
        placeholder={open ? (selected?.label ?? placeholder) : placeholder}
        onFocus={() => {
          setOpen(true);
          setActiveIndex(
            Math.max(
              0,
              options.findIndex((option) => option.value === value)
            )
          );
        }}
        onBlur={close}
        onChange={(event) => {
          setOpen(true);
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActiveIndex((index) =>
              Math.min(
                Math.max(index + step, 0),
                Math.max(matches.length - 1, 0)
              )
            );
          } else if (event.key === "Enter" && open && matches[activeIndex]) {
            event.preventDefault();
            choose(matches[activeIndex]);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
      />

      {open && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label={label}
          className="combobox-field__list"
        >
          {matches.length === 0 && (
            <li className="combobox-field__empty">{noResultsLabel}</li>
          )}
          {matches.map((option, index) => (
            <li
              key={option.value}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              className={cn("combobox-field__option", {
                "combobox-field__option--active": index === activeIndex,
                "combobox-field__option--current": option.value === value,
              })}
              // Picks on mouse-down and keeps the input focused, so the blur
              // that would close the list never comes first. The keyboard
              // works on the input (arrows and Enter).
              onMouseDown={(event) => {
                event.preventDefault();
                choose(option);
              }}
              onMouseMove={() => setActiveIndex(index)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
