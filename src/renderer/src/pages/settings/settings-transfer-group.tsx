import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DownloadIcon, UploadIcon } from "@primer/octicons-react";

import { Button, CheckboxField } from "@renderer/components";
import { useToast } from "@renderer/hooks";
import { levelDBService } from "@renderer/services/leveldb.service";
import type { SettingsTransferResult } from "@types";

/** Export and import of the settings, for setting up another computer. */
export function SettingsTransferGroup({
  onImported,
}: Readonly<{ onImported: () => void }>) {
  const { t } = useTranslation("settings");
  const { showSuccessToast, showErrorToast } = useToast();
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (
    action: () => Promise<SettingsTransferResult>,
    done: string,
    failed: string
  ) => {
    setBusy(true);
    try {
      const result = await action();
      if (result.status === "done") {
        showSuccessToast(done, result.path);
        return true;
      }
      if (result.status === "failed") showErrorToast(failed, result.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-context-panel__group">
      <h3>{t("settings_transfer")}</h3>
      <p className="settings-context-panel__description">
        {t("settings_transfer_description")}
      </p>

      <CheckboxField
        label={t("settings_transfer_include_secrets")}
        checked={includeSecrets}
        onChange={() => setIncludeSecrets((value) => !value)}
      />

      <div className="settings-context-panel__actions">
        <Button
          theme="outline"
          disabled={busy}
          onClick={() =>
            void run(
              () => window.electron.exportSettings(includeSecrets),
              t("settings_transfer_exported"),
              t("settings_transfer_export_failed")
            )
          }
        >
          <UploadIcon />
          {t("settings_transfer_export")}
        </Button>
        <Button
          theme="outline"
          disabled={busy}
          onClick={() =>
            void run(
              () => window.electron.importSettings(),
              t("settings_transfer_imported"),
              t("settings_transfer_import_failed")
            ).then(async (imported) => {
              if (!imported) return;
              await levelDBService.get("userPreferences", null, "json");
              onImported();
            })
          }
        >
          <DownloadIcon />
          {t("settings_transfer_import")}
        </Button>
      </div>
    </div>
  );
}
