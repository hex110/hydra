import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { XIcon } from "@primer/octicons-react";

import { TextField } from "@renderer/components/text-field/text-field";
import "./tag-picker.scss";

const SUGGESTIONS = 8;

export interface TagPickerProps {
  /** Chosen Steam tag ids. */
  value: number[];
  onChange: (value: number[]) => void;
  /** Tag id → name in the app language. */
  labels: ReadonlyMap<number, string>;
  placeholder: string;
  /** Names the field for screen readers. */
  label: string;
}

/** Chosen tags as chips, and a search that offers the tags that match. */
export function TagPicker({
  value,
  onChange,
  labels,
  placeholder,
  label,
}: Readonly<TagPickerProps>) {
  const { t } = useTranslation("catalogue");
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];

    return [...labels]
      .filter(
        ([id, name]) =>
          !value.includes(id) && name.toLowerCase().includes(needle)
      )
      .sort(
        ([, a], [, b]) =>
          Number(b.toLowerCase().startsWith(needle)) -
            Number(a.toLowerCase().startsWith(needle)) || a.length - b.length
      )
      .slice(0, SUGGESTIONS);
  }, [labels, query, value]);

  const add = (id: number) => {
    onChange([...value, id]);
    setQuery("");
  };

  return (
    <div className="tag-picker">
      <TextField
        theme="dark"
        value={query}
        placeholder={placeholder}
        aria-label={label}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && matches[0]) {
            event.preventDefault();
            add(matches[0][0]);
          }
        }}
      />

      {matches.length > 0 && (
        <ul className="tag-picker__matches">
          {matches.map(([id, name]) => (
            <li key={id}>
              <button
                type="button"
                className="tag-picker__match"
                onClick={() => add(id)}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {value.length > 0 && (
        <ul className="tag-picker__chosen">
          {value.map((id) => (
            <li key={id} className="tag-picker__chip">
              <span>{labels.get(id) ?? id}</span>
              <button
                type="button"
                className="tag-picker__remove"
                onClick={() => onChange(value.filter((item) => item !== id))}
                aria-label={t("remove_tag", { tag: labels.get(id) ?? id })}
              >
                <XIcon size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
