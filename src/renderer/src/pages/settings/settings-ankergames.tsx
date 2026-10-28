import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, CheckboxField, TextField } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector, useDate } from "@renderer/hooks";
import { useFormat } from "@renderer/hooks/use-format";
import { logger } from "@renderer/logger";
import type { AnkerGamesStatus } from "@types";

export function SettingsAnkerGames() {
  const { t } = useTranslation("settings");
  const { updateUserPreferences } = useContext(settingsContext);
  const { formatDistance } = useDate();
  const { numberFormatter } = useFormat();
  const enabled = useAppSelector(
    (state) => state.userPreferences.value?.ankerGamesSource !== false
  );

  const [status, setStatus] = useState<AnkerGamesStatus | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [browserFolder, setBrowserFolder] = useState("");
  const customFolder = useAppSelector(
    (state) => state.userPreferences.value?.ankerGamesBrowserDownloadsPath
  );

  useEffect(() => {
    window.electron
      .getAnkerGamesBrowserDownloadsPath()
      .then(setBrowserFolder)
      .catch((error) =>
        logger.error("Failed to read the browser downloads folder:", error)
      );
  }, [customFolder]);

  const chooseBrowserFolder = async () => {
    const { canceled, filePaths } = await window.electron.showOpenDialog({
      defaultPath: browserFolder || undefined,
      properties: ["openDirectory"],
    });
    const selectedPath = filePaths[0];
    if (canceled || !selectedPath) return;
    await updateUserPreferences({
      ankerGamesBrowserDownloadsPath: selectedPath,
    });
  };

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await window.electron.getAnkerGamesStatus());
    } catch (error) {
      logger.error("Failed to load AnkerGames status:", error);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      await window.electron.refreshAnkerGames();
    } finally {
      await loadStatus();
      setIsRefreshing(false);
    }
  };

  const toggle = async () => {
    await updateUserPreferences({ ankerGamesSource: !enabled });
    if (!enabled) void refresh();
  };

  const statusCopy = () => {
    if (isRefreshing || status?.refreshing) return t("ankergames_refreshing");
    const ready = status?.fetchedAt
      ? t("ankergames_ready", {
          count: status.games,
          countFormatted: numberFormatter.format(status.games),
          age: formatDistance(new Date(status.fetchedAt), new Date(), {
            addSuffix: true,
          }),
        })
      : null;
    if (status?.error) {
      return [t("ankergames_failed", { error: status.error }), ready]
        .filter(Boolean)
        .join(" ");
    }
    return ready ?? t("ankergames_pending");
  };

  return (
    <div className="settings-download-sources__local-matching">
      <CheckboxField
        label={t("ankergames_source")}
        checked={enabled}
        onChange={toggle}
      />
      <small>{t("ankergames_source_description")}</small>
      {enabled && (
        <>
          <small className="settings-download-sources__local-status">
            {statusCopy()}
          </small>
          <div className="settings-download-sources__verify">
            <Button
              type="button"
              theme="outline"
              onClick={refresh}
              disabled={isRefreshing}
            >
              {t("ankergames_refresh")}
            </Button>
          </div>
          <div className="settings-download-sources__verify">
            <TextField
              label={t("ankergames_browser_folder")}
              hint={t("ankergames_browser_folder_hint")}
              value={browserFolder}
              readOnly
              disabled
              rightContent={
                <Button
                  type="button"
                  theme="outline"
                  onClick={chooseBrowserFolder}
                >
                  {t("ankergames_browser_folder_change")}
                </Button>
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
