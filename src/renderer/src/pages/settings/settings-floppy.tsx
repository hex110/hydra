import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, CheckboxField, TextField } from "@renderer/components";
import { useAppSelector, useToast } from "@renderer/hooks";
import { settingsContext } from "@renderer/context";

import "./settings-floppy.scss";

export function SettingsFloppy() {
  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );
  const { updateUserPreferences } = useContext(settingsContext);
  const { showSuccessToast, showErrorToast } = useToast();
  const { t } = useTranslation("settings");

  const [isBusy, setIsBusy] = useState(false);
  const [form, setForm] = useState(() => ({
    enabled: userPreferences?.floppyEnabled ?? false,
    url: userPreferences?.floppyUrl ?? "",
    token: userPreferences?.floppyApiToken ?? "",
  }));

  useEffect(() => {
    if (!userPreferences) return;
    setForm({
      enabled: userPreferences.floppyEnabled ?? false,
      url: userPreferences.floppyUrl ?? "",
      token: userPreferences.floppyApiToken ?? "",
    });
  }, [userPreferences]);

  const canTest = form.url !== "" && form.token !== "" && !isBusy;

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (
    event
  ) => {
    event.preventDefault();
    setIsBusy(true);

    try {
      await window.electron.testFloppyConnection(form.url, form.token);
      await updateUserPreferences({
        floppyEnabled: form.enabled,
        floppyUrl: form.url,
        floppyApiToken: form.token,
      });
      showSuccessToast(t("floppy_connection_ok"));
    } catch {
      showErrorToast(t("floppy_connection_failed"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggle = () => {
    const enabled = !form.enabled;
    setForm((prev) => ({ ...prev, enabled }));
    if (!enabled) updateUserPreferences({ floppyEnabled: false });
  };

  const handleSync = async (dryRun: boolean) => {
    setIsBusy(true);

    try {
      const report = await window.electron.syncFloppyLibrary(dryRun);
      showSuccessToast(
        t(dryRun ? "floppy_sync_preview_result" : "floppy_sync_result", {
          created: report.created,
          updated: report.updated,
          unchanged: report.unchanged,
          unmatched: report.unmatched.length,
          failed: report.failed,
        })
      );
    } catch {
      showErrorToast(t("floppy_sync_failed"));
    } finally {
      setIsBusy(false);
    }
  };

  const isSaved = Boolean(
    userPreferences?.floppyEnabled &&
      userPreferences.floppyUrl &&
      userPreferences.floppyApiToken
  );

  return (
    <form className="settings-floppy__form" onSubmit={handleSubmit}>
      <h3>{t("floppy_title")}</h3>
      <p className="settings-floppy__description">{t("floppy_description")}</p>

      <CheckboxField
        label={t("floppy_enable")}
        checked={form.enabled}
        onChange={handleToggle}
      />

      {form.enabled && (
        <>
          <TextField
            label={t("floppy_url")}
            value={form.url}
            placeholder="http://localhost:8000"
            onChange={(event) => setForm({ ...form, url: event.target.value })}
          />
          <TextField
            label={t("floppy_api_token")}
            value={form.token}
            type="password"
            placeholder={t("floppy_api_token")}
            onChange={(event) =>
              setForm({ ...form, token: event.target.value })
            }
            rightContent={
              <Button type="submit" disabled={!canTest}>
                {t("floppy_test_connection")}
              </Button>
            }
          />

          {isSaved && (
            <div className="settings-floppy__actions">
              <Button
                type="button"
                theme="outline"
                disabled={isBusy}
                onClick={() => handleSync(true)}
              >
                {t("floppy_preview_library")}
              </Button>
              <Button
                type="button"
                disabled={isBusy}
                onClick={() => handleSync(false)}
              >
                {t("floppy_sync_library")}
              </Button>
            </div>
          )}
        </>
      )}
    </form>
  );
}
