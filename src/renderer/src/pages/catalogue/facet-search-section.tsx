import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { XIcon } from "@primer/octicons-react";

import { CheckboxField } from "@renderer/components/checkbox-field/checkbox-field";
import { SidebarSection } from "@renderer/components/sidebar-section/sidebar-section";
import { TextField } from "@renderer/components/text-field/text-field";
import "./facet-search-section.scss";

const MATCHES = 50;
const LIBRARY_SHOWN = 5;

interface FacetSearchSectionProps {
  title: string;
  placeholder: string;
  /** Every name the filter knows. */
  names: readonly string[];
  selected: string[];
  /** Names from the person's library, most played first. */
  fromLibrary: readonly string[];
  onChange: (next: string[]) => void;
  /** Shows a name; some come with HTML entities. */
  format?: (name: string) => string;
}

/**
 * A filter for a very long list (developers, publishers): nothing is listed
 * until you type, except the few your library suggests. Chosen names show as
 * chips under the field.
 */
export function FacetSearchSection({
  title,
  placeholder,
  names,
  selected,
  fromLibrary,
  onChange,
  format = (name) => name,
}: Readonly<FacetSearchSectionProps>) {
  const { t } = useTranslation("catalogue");
  const [query, setQuery] = useState("");

  const known = useMemo(() => new Set(names), [names]);
  const suggestions = useMemo(
    () =>
      fromLibrary
        .filter((name) => known.has(name) && !selected.includes(name))
        .slice(0, LIBRARY_SHOWN),
    [fromLibrary, known, selected]
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return names
      .filter(
        (name) =>
          !selected.includes(name) &&
          format(name).toLowerCase().includes(needle)
      )
      .slice(0, MATCHES);
    // `format` is a pure display function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names, query, selected]);

  const add = (name: string) => onChange([...selected, name]);

  return (
    <SidebarSection title={title} defaultOpen={selected.length > 0}>
      <div className="facet-search-section">
        {selected.length > 0 && (
          <ul className="facet-search-section__chosen">
            {selected.map((name) => (
              <li key={name} className="facet-search-section__chip">
                <span>{format(name)}</span>
                <button
                  type="button"
                  className="facet-search-section__remove"
                  aria-label={`${t("clear_filters", { filterCount: 1 })}: ${format(name)}`}
                  onClick={() => onChange(selected.filter((n) => n !== name))}
                >
                  <XIcon size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <TextField
          theme="dark"
          value={query}
          placeholder={placeholder}
          aria-label={title}
          onChange={(event) => setQuery(event.target.value)}
        />

        {matches.length > 0 && (
          <ul className="facet-search-section__matches">
            {matches.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  className="facet-search-section__match"
                  onClick={() => {
                    add(name);
                    setQuery("");
                  }}
                >
                  {format(name)}
                </button>
              </li>
            ))}
          </ul>
        )}

        {!query && suggestions.length > 0 && (
          <>
            <span className="facet-search-section__label">
              {t("from_your_library")}
            </span>
            {suggestions.map((name) => (
              <CheckboxField
                key={name}
                label={format(name)}
                checked={false}
                onChange={() => add(name)}
              />
            ))}
          </>
        )}
      </div>
    </SidebarSection>
  );
}
