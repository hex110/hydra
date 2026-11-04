import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileDirectoryIcon, LinkIcon, SyncIcon } from "@primer/octicons-react";
import { formatBytes } from "@shared";

import { Button } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useToast } from "@renderer/hooks";
import { logger } from "@renderer/logger";
import type { ModsOverview } from "@types";

// Same panel look as the other tool pages.
import "./settings-optiscaler.scss";

/** Settings → Mods: where mod downloads come from and where mods are kept. */
export function SettingsContextMods() {
  const { t } = useTranslation("mods");
  const { setCurrentCategoryId } = useContext(settingsContext);
  const { showErrorToast } = useToast();
  const [overview, setOverview] = useState<ModsOverview | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    window.electron
      .getModsOverview()
      .then(setOverview)
      .catch((error) => {
        logger.error("Failed to load the mods overview", error);
        setFailed(true);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (failed)
    return (
      <div className="settings-context-panel settings-optiscaler">
        <p className="settings-optiscaler__error">
          {t("settings_load_failed")}
        </p>
        <div className="settings-optiscaler__actions">
          <Button theme="outline" onClick={load}>
            <SyncIcon size={14} />
            {t("retry")}
          </Button>
        </div>
      </div>
    );

  if (!overview)
    return (
      <div className="settings-context-panel settings-optiscaler">
        <p className="settings-optiscaler__muted">{t("loading")}</p>
      </div>
    );

  const { torBox } = overview;

  return (
    <div className="settings-context-panel settings-optiscaler">
      <div className="settings-context-panel__group">
        <p className="settings-optiscaler__muted">
          {t("settings_description")}
        </p>
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("settings_downloads")}</h3>
        <p className="settings-optiscaler__muted">
          {torBox.connected
            ? torBox.nexusLinksLeft !== null
              ? t("settings_torbox_links", {
                  left: torBox.nexusLinksLeft,
                  limit: torBox.nexusLinksLimit,
                })
              : t("settings_torbox_links_unknown")
            : t("settings_torbox_missing")}
        </p>
        <div className="settings-optiscaler__actions">
          <Button
            theme="outline"
            onClick={() => setCurrentCategoryId("integrations")}
          >
            {torBox.connected
              ? t("settings_torbox_change")
              : t("settings_torbox_set_up")}
          </Button>
          {torBox.connected && (
            <Button theme="outline" onClick={load}>
              <SyncIcon size={14} />
              {t("settings_refresh")}
            </Button>
          )}
        </div>
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("settings_nxm")}</h3>
        <p className="settings-optiscaler__muted">
          {overview.isNxmHandler ? t("settings_nxm_on") : t("settings_nxm_off")}
        </p>
        {!overview.isNxmHandler && (
          <div className="settings-optiscaler__actions">
            <Button
              theme="outline"
              onClick={async () => {
                const registered = await window.electron
                  .registerNxmHandler()
                  .catch(() => false);
                if (!registered) showErrorToast(t("nxm_register_failed"));
                load();
              }}
            >
              <LinkIcon size={14} />
              {t("nxm_register")}
            </Button>
          </div>
        )}
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("settings_storage")}</h3>
        <p className="settings-optiscaler__muted">
          {t("settings_storage_summary", {
            size: formatBytes(overview.storageBytes),
            count: overview.games,
            path: overview.storagePath,
          })}
        </p>
        <div className="settings-optiscaler__actions">
          <Button
            theme="outline"
            onClick={() =>
              void window.electron.openFolder(overview.storagePath)
            }
          >
            <FileDirectoryIcon size={14} />
            {t("settings_storage_open")}
          </Button>
        </div>
      </div>
    </div>
  );
}
