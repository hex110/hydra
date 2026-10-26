import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageIcon } from "@primer/octicons-react";
import { Button, Link, TextField } from "@renderer/components";
import { useAppSelector, useToast } from "@renderer/hooks";
import { settingsContext } from "@renderer/context";

import { SettingsIntegrationCard } from "./settings-integration-card";

import "./settings-tracking.scss";

const API_KEY_URL = "https://www.steamgriddb.com/profile/preferences/api";
const FORM_ID = "settings-steamgriddb-connect";

export function SettingsSteamGridDb() {
  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );
  const { updateUserPreferences } = useContext(settingsContext);
  const { showSuccessToast, showErrorToast } = useToast();
  const { t } = useTranslation("settings");

  const [apiKey, setApiKey] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const isConnected = Boolean(userPreferences?.steamGridDbApiKey);

  const handleConnect: React.FormEventHandler<HTMLFormElement> = async (
    event
  ) => {
    event.preventDefault();
    setIsBusy(true);

    try {
      const key = apiKey.trim();
      await window.electron.testSteamGridDbApiKey(key);
      await updateUserPreferences({ steamGridDbApiKey: key });
      setApiKey("");
      showSuccessToast(t("steamgriddb_connected"));
    } catch {
      showErrorToast(t("steamgriddb_connection_failed"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDisconnect = async () => {
    await updateUserPreferences({ steamGridDbApiKey: null });
    showSuccessToast(t("steamgriddb_disconnected"));
  };

  return (
    <SettingsIntegrationCard
      title={t("steamgriddb_title")}
      logo={<ImageIcon />}
      status={
        isConnected
          ? t("tracking_status_connected")
          : t("integration_status_not_connected")
      }
      statusTone={isConnected ? "success" : "neutral"}
      actions={
        isConnected ? (
          <Button theme="danger" onClick={() => void handleDisconnect()}>
            {t("integration_disconnect")}
          </Button>
        ) : (
          <Button
            type="submit"
            form={FORM_ID}
            disabled={isBusy || !apiKey.trim()}
          >
            {t("integration_connect")}
          </Button>
        )
      }
    >
      {isConnected ? (
        <p className="settings-integration-card__description">
          {t("steamgriddb_connected_description")}
        </p>
      ) : (
        <form
          id={FORM_ID}
          className="settings-tracking__form"
          onSubmit={handleConnect}
        >
          <p className="settings-integration-card__description">
            {t("steamgriddb_description")}
          </p>
          <TextField
            label={t("steamgriddb_api_key")}
            value={apiKey}
            type="password"
            placeholder={t("steamgriddb_api_key")}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <p className="settings-integration-card__meta">
            {t("steamgriddb_api_key_hint")}{" "}
            <Link to={API_KEY_URL}>steamgriddb.com</Link>
          </p>
        </form>
      )}
    </SettingsIntegrationCard>
  );
}
