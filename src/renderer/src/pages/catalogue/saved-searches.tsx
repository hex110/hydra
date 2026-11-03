import { useState } from "react";
import { useTranslation } from "react-i18next";
import { XIcon } from "@primer/octicons-react";
import type { CatalogueSearchPayload } from "@types";
import { Button } from "@renderer/components/button/button";
import { SidebarSection } from "@renderer/components/sidebar-section/sidebar-section";
import { TextField } from "@renderer/components/text-field/text-field";
import { useTuneSettings } from "./use-tune-settings";
import "./saved-searches.scss";

interface SavedSearchesProps {
  filters: CatalogueSearchPayload;
  onApply: (filters: Partial<CatalogueSearchPayload>) => void;
}

/** Browse searches saved under a name: filters and sort, applied with one click. */
export function SavedSearches({
  filters,
  onApply,
}: Readonly<SavedSearchesProps>) {
  const { t } = useTranslation("catalogue");
  const { settings, saveBrowsePreset, deleteBrowsePreset } = useTuneSettings();
  const [name, setName] = useState("");
  const saved = settings.browsePresets ?? [];

  return (
    <SidebarSection title={t("saved_searches")}>
      <div className="saved-searches">
        {saved.length === 0 && (
          <p className="saved-searches__hint">{t("saved_searches_empty")}</p>
        )}
        {saved.length > 0 && (
          <ul className="saved-searches__list">
            {saved.map((preset) => (
              <li key={preset.id} className="saved-searches__row">
                <button
                  type="button"
                  className="saved-searches__apply"
                  onClick={() =>
                    onApply(preset.filters as Partial<CatalogueSearchPayload>)
                  }
                >
                  {preset.name}
                </button>
                <button
                  type="button"
                  className="saved-searches__delete"
                  aria-label={t("saved_search_delete", { name: preset.name })}
                  onClick={() => deleteBrowsePreset(preset.id)}
                >
                  <XIcon size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <TextField
          theme="dark"
          value={name}
          placeholder={t("saved_search_name")}
          aria-label={t("saved_search_name")}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          theme="outline"
          disabled={!name.trim()}
          onClick={() => {
            saveBrowsePreset(name.trim(), { ...filters, title: filters.title });
            setName("");
          }}
        >
          {t("saved_search_save")}
        </Button>
      </div>
    </SidebarSection>
  );
}
