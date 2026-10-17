import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { debounce } from "lodash-es";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon, ChevronUpIcon } from "@primer/octicons-react";
import type { DownloadSource } from "@types";

import { CheckboxField, SelectField, TextField } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector } from "@renderer/hooks";

import "./settings-repack-preferences.scss";

/** How Hydra picks a repack for downloads requested by the browser add-on. */
export function SettingsRepackPreferences() {
  const { t } = useTranslation("settings");
  const { updateUserPreferences } = useContext(settingsContext);
  const updateUserPreferencesRef = useRef(updateUserPreferences);
  updateUserPreferencesRef.current = updateUserPreferences;

  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );
  const [sources, setSources] = useState<DownloadSource[]>([]);
  const [excludedWords, setExcludedWords] = useState(
    () => userPreferences?.repackExcludedWords ?? ""
  );
  const [maxSize, setMaxSize] = useState(() =>
    userPreferences?.repackMaxSizeInGigabytes
      ? String(userPreferences.repackMaxSizeInGigabytes)
      : ""
  );

  useEffect(() => {
    window.electron
      .getDownloadSources()
      .then(setSources)
      .catch(() => setSources([]));
  }, []);

  const save = useMemo(
    () =>
      debounce(
        (changes: Parameters<typeof updateUserPreferences>[0]) =>
          updateUserPreferencesRef.current(changes),
        500
      ),
    []
  );

  useEffect(
    () => () => {
      save.flush();
    },
    [save]
  );

  const preferredIds = userPreferences?.preferredDownloadSourceIds ?? [];
  const orderedSources = [...sources].sort((a, b) => {
    const rankA = preferredIds.indexOf(a.id);
    const rankB = preferredIds.indexOf(b.id);
    return (
      (rankA === -1 ? Number.MAX_SAFE_INTEGER : rankA) -
      (rankB === -1 ? Number.MAX_SAFE_INTEGER : rankB)
    );
  });

  const moveSource = (index: number, offset: number) => {
    const ids = orderedSources.map((source) => source.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + offset, 0, moved);
    updateUserPreferences({ preferredDownloadSourceIds: ids });
  };

  return (
    <div className="settings-context-panel__group settings-repack-preferences">
      <h3>{t("repack_preferences")}</h3>
      <p className="settings-repack-preferences__muted">
        {t("repack_preferences_description")}
      </p>

      <CheckboxField
        label={t("start_browser_downloads_immediately")}
        checked={userPreferences?.startBrowserDownloadsImmediately === true}
        onChange={() =>
          updateUserPreferences({
            startBrowserDownloadsImmediately:
              userPreferences?.startBrowserDownloadsImmediately !== true,
          })
        }
      />

      {orderedSources.length > 0 && (
        <div className="settings-repack-preferences__sources">
          <span className="settings-repack-preferences__label">
            {t("repack_source_order")}
          </span>
          <ol>
            {orderedSources.map((source, index) => (
              <li key={source.id}>
                <span>{source.name}</span>
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => moveSource(index, -1)}
                  aria-label={t("repack_source_move_up")}
                >
                  <ChevronUpIcon size={14} />
                </button>
                <button
                  type="button"
                  disabled={index === orderedSources.length - 1}
                  onClick={() => moveSource(index, 1)}
                  aria-label={t("repack_source_move_down")}
                >
                  <ChevronDownIcon size={14} />
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      <SelectField
        label={t("repack_sort_preference")}
        theme="dark"
        value={userPreferences?.repackSortPreference ?? "newest"}
        options={(["newest", "smallest"] as const).map((value) => ({
          key: value,
          value,
          label: t(`repack_sort_${value}`),
        }))}
        onChange={(event) =>
          updateUserPreferences({
            repackSortPreference: event.target.value as "newest" | "smallest",
          })
        }
      />

      <TextField
        label={t("repack_excluded_words")}
        value={excludedWords}
        theme="dark"
        placeholder="macOS, Linux, Lite"
        onChange={(event) => {
          setExcludedWords(event.target.value);
          save({ repackExcludedWords: event.target.value });
        }}
      />

      <TextField
        label={t("repack_max_size")}
        value={maxSize}
        theme="dark"
        type="number"
        min={0}
        placeholder={t("repack_max_size_placeholder")}
        onChange={(event) => {
          setMaxSize(event.target.value);
          const gigabytes = Number.parseFloat(event.target.value);
          save({
            repackMaxSizeInGigabytes:
              Number.isFinite(gigabytes) && gigabytes > 0 ? gigabytes : null,
          });
        }}
      />
    </div>
  );
}
