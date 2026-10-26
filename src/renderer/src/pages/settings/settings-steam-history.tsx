import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SyncIcon } from "@primer/octicons-react";
import {
  Button,
  CheckboxField,
  ConfirmationModal,
  Link,
  SelectField,
  TextField,
} from "@renderer/components";
import { useAppSelector, useToast } from "@renderer/hooks";
import { settingsContext } from "@renderer/context";
import type { SteamHistorySyncStatus } from "@types";
import SteamLogo from "@renderer/assets/steam-integration-logo.svg?react";

import {
  SettingsIntegrationCard,
  SettingsIntegrationLastSynced,
} from "./settings-integration-card";
import {
  IntegrationSection,
  useRemoveImportsPrompt,
  useTrackingStatus,
} from "./settings-tracking-shared";
import { useTaskErrorMessage } from "../downloads/use-task-error-message";

import "./settings-tracking.scss";

const MIN_PLAYTIME_OPTIONS = [0, 1, 30, 60] as const;
const DEFAULT_MIN_MINUTES = 30;
const API_KEY_URL = "https://steamcommunity.com/dev/apikey";
const FORM_ID = "settings-steam-history-connect";

const toIso = (ms: number | null | undefined) =>
  ms ? new Date(ms).toISOString() : null;

export function SettingsSteamHistory() {
  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );
  const { updateUserPreferences } = useContext(settingsContext);
  const { showSuccessToast, showErrorToast } = useToast();
  const { t } = useTranslation("settings");
  const taskErrorMessage = useTaskErrorMessage();
  const { statuses, isRunning } = useTrackingStatus();
  const { offerRemoval, modal: removeImportsModal } = useRemoveImportsPrompt();

  const [isBusy, setIsBusy] = useState(false);
  const [preview, setPreview] = useState<{
    owned: number;
    wouldAdd: number;
    alreadyInLibrary: number;
  } | null>(null);
  const [status, setStatus] = useState<SteamHistorySyncStatus | null>(null);
  const [form, setForm] = useState({ apiKey: "", steamId: "" });
  const [disconnect, setDisconnect] = useState<{
    removable: number;
    remove: boolean;
  } | null>(null);

  const isConnected = Boolean(
    userPreferences?.steamHistoryApiKey && userPreferences.steamHistorySteamId
  );
  const importRunning = isRunning("steam-history") || status?.running === true;
  const historyStatus = statuses?.steamHistory;
  const wishlistStatus = statuses?.steamWishlist;
  const addToLibrary = userPreferences?.steamHistoryAddToLibrary === true;
  const minMinutes =
    userPreferences?.steamHistoryMinMinutes ?? DEFAULT_MIN_MINUTES;
  const followWishlist = userPreferences?.steamWishlistTrack === true;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      const current = await window.electron
        .getSteamHistorySyncStatus()
        .catch(() => null);
      if (cancelled || !current) return;
      setStatus(current);
      if (current.running) timer = setTimeout(poll, 1000);
    };

    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [importRunning]);

  const handleConnect: React.FormEventHandler<HTMLFormElement> = async (
    event
  ) => {
    event.preventDefault();
    setIsBusy(true);

    try {
      const apiKey = form.apiKey.trim();
      const steamId = form.steamId.trim();
      const { ownedGames } = await window.electron.testSteamHistoryConnection(
        apiKey,
        steamId
      );
      await updateUserPreferences({
        steamHistoryApiKey: apiKey,
        steamHistorySteamId: steamId,
      });
      setForm({ apiKey: "", steamId: "" });
      showSuccessToast(t("steam_history_connected", { count: ownedGames }));
    } catch {
      showErrorToast(t("steam_history_connection_failed"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleImport = async () => {
    try {
      setStatus(await window.electron.syncSteamHistory());
    } catch {
      showErrorToast(t("steam_history_sync_failed"));
    }
  };

  const handlePreview = async () => {
    setIsBusy(true);

    try {
      setPreview(await window.electron.previewSteamLibraryImport(minMinutes));
    } catch {
      showErrorToast(t("steam_history_sync_failed"));
    } finally {
      setIsBusy(false);
    }
  };

  const toggleAddToLibrary = async () => {
    await updateUserPreferences({
      steamHistoryAddToLibrary: !addToLibrary,
      steamHistoryMinMinutes: minMinutes,
    });
    if (addToLibrary) void offerRemoval("steam-history");
  };

  const toggleWishlistLibrary = async () => {
    const listed = userPreferences?.steamWishlistAddToLibrary !== false;
    await updateUserPreferences({ steamWishlistAddToLibrary: !listed });
    if (listed) void offerRemoval("steam-wishlist");
  };

  const openDisconnect = async () => {
    const counts = await Promise.all([
      window.electron.countRemovableImports("steam-history").catch(() => 0),
      window.electron.countRemovableImports("steam-wishlist").catch(() => 0),
    ]);
    const removable = counts[0] + counts[1];
    setDisconnect({ removable, remove: removable > 0 });
  };

  const handleDisconnect = async () => {
    if (!disconnect) return;
    setIsBusy(true);

    try {
      await updateUserPreferences({
        steamHistoryApiKey: null,
        steamHistorySteamId: null,
      });
      if (disconnect.remove) {
        await window.electron.removeImportedGames("steam-history");
        await window.electron.removeImportedGames("steam-wishlist");
      }
      await window.electron.resetIntegrationStatus("steamHistory");
      await window.electron.resetIntegrationStatus("steamWishlist");
      setPreview(null);
      showSuccessToast(t("steam_history_disconnected"));
    } catch {
      showErrorToast(t("steam_history_disconnect_failed"));
    } finally {
      setIsBusy(false);
      setDisconnect(null);
    }
  };

  const lastError = historyStatus?.lastError ?? null;
  const cardStatus = !isConnected
    ? t("integration_status_not_connected")
    : importRunning
      ? t("tracking_status_importing")
      : lastError
        ? t("tracking_status_failed")
        : t("tracking_status_connected");
  const statusTone = !isConnected
    ? "neutral"
    : lastError && !importRunning
      ? "warning"
      : "success";

  const renderActions = () => {
    if (!isConnected) {
      return (
        <Button
          type="submit"
          form={FORM_ID}
          disabled={isBusy || !form.apiKey.trim() || !form.steamId.trim()}
        >
          {t("integration_connect")}
        </Button>
      );
    }

    return (
      <>
        <Button
          theme="outline"
          onClick={handleImport}
          disabled={isBusy || importRunning}
        >
          <SyncIcon size={14} />
          {t("steam_history_import")}
        </Button>
        <Button
          theme="danger"
          onClick={() => void openDisconnect()}
          disabled={isBusy || importRunning}
        >
          {t("integration_disconnect")}
        </Button>
      </>
    );
  };

  const renderProgress = () => {
    if (!status?.running) return null;
    const percentage =
      status.total > 0 ? (status.processed / status.total) * 100 : 0;

    return (
      <div className="settings-integration-card__progress" role="status">
        <div className="settings-integration-card__progress-header">
          <span>{t("tracking_status_importing")}</span>
          {status.total > 0 && (
            <span className="settings-integration-card__progress-count">
              {t("tracking_progress", {
                processed: status.processed,
                total: status.total,
              })}
            </span>
          )}
        </div>
        <div className="settings-integration-card__progress-track">
          <div
            className={
              status.total > 0
                ? "settings-integration-card__progress-fill"
                : "settings-integration-card__progress-fill settings-integration-card__progress-fill--indeterminate"
            }
            style={status.total > 0 ? { width: `${percentage}%` } : undefined}
          />
        </div>
      </div>
    );
  };

  const renderConnectForm = () => (
    <form
      id={FORM_ID}
      className="settings-tracking__form"
      onSubmit={handleConnect}
    >
      <p className="settings-integration-card__description">
        {t("steam_history_description")}
      </p>
      <TextField
        label={t("steam_history_steam_id")}
        value={form.steamId}
        placeholder="7656119…"
        hint={t("steam_history_steam_id_hint")}
        onChange={(event) => setForm({ ...form, steamId: event.target.value })}
      />
      <TextField
        label={t("steam_history_api_key")}
        value={form.apiKey}
        type="password"
        placeholder={t("steam_history_api_key")}
        onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
      />
      <p className="settings-integration-card__meta">
        {t("steam_history_api_key_hint")}{" "}
        <Link to={API_KEY_URL}>steamcommunity.com/dev/apikey</Link>
      </p>
    </form>
  );

  const renderConnected = () => (
    <>
      <div className="settings-integration-card__account">
        <span className="settings-integration-card__username">
          {t("steam_history_account", {
            steamId: userPreferences?.steamHistorySteamId,
          })}
        </span>
        <SettingsIntegrationLastSynced
          lastSyncedAt={toIso(historyStatus?.lastSyncedAt)}
        />
      </div>

      {renderProgress()}

      {lastError && !importRunning && (
        <p className="settings-integration-card__message settings-tracking__error">
          {taskErrorMessage("steam-history", lastError)}
        </p>
      )}

      <IntegrationSection
        title={t("tracking_section_library")}
        description={t("steam_history_library_description")}
      >
        <CheckboxField
          label={t("steam_history_add_to_library")}
          checked={addToLibrary}
          onChange={() => void toggleAddToLibrary()}
        />

        {addToLibrary && (
          <div className="settings-tracking__row">
            <SelectField
              label={t("steam_history_min_playtime")}
              value={String(minMinutes)}
              options={MIN_PLAYTIME_OPTIONS.map((minutes) => ({
                key: String(minutes),
                value: String(minutes),
                label: t(`steam_history_min_${minutes}`),
              }))}
              onChange={(event) => {
                setPreview(null);
                void updateUserPreferences({
                  steamHistoryMinMinutes: Number(event.target.value),
                });
              }}
            />
            <Button
              theme="outline"
              disabled={isBusy}
              onClick={() => void handlePreview()}
            >
              {t("steam_history_preview")}
            </Button>
          </div>
        )}

        {addToLibrary && preview && (
          <p className="settings-integration-card__meta">
            {t("steam_history_preview_result", { ...preview })}
          </p>
        )}
      </IntegrationSection>

      <IntegrationSection
        title={t("tracking_section_wishlist")}
        description={t("steam_wishlist_description")}
      >
        <CheckboxField
          label={t("steam_wishlist_track")}
          checked={followWishlist}
          onChange={() =>
            updateUserPreferences({ steamWishlistTrack: !followWishlist })
          }
        />

        {followWishlist && (
          <>
            <CheckboxField
              label={t("steam_wishlist_add_to_library")}
              checked={userPreferences?.steamWishlistAddToLibrary !== false}
              onChange={() => void toggleWishlistLibrary()}
            />
            <CheckboxField
              label={t("steam_wishlist_notify_date")}
              checked={userPreferences?.steamWishlistNotifyDate === true}
              onChange={() =>
                updateUserPreferences({
                  steamWishlistNotifyDate:
                    userPreferences?.steamWishlistNotifyDate !== true,
                })
              }
            />
            <div className="settings-tracking__row">
              <Button
                theme="outline"
                disabled={isRunning("steam-wishlist")}
                onClick={() => void window.electron.syncSteamWishlist()}
              >
                <SyncIcon size={14} />
                {t("steam_wishlist_check")}
              </Button>
              <span className="settings-integration-card__meta">
                {wishlistStatus?.lastError
                  ? taskErrorMessage("steam-wishlist", wishlistStatus.lastError)
                  : wishlistStatus?.lastSyncedAt
                    ? t("steam_wishlist_last_checked", {
                        date: new Date(
                          wishlistStatus.lastSyncedAt
                        ).toLocaleString(),
                      })
                    : t("steam_wishlist_check_hint")}
              </span>
            </div>
          </>
        )}
      </IntegrationSection>
    </>
  );

  return (
    <>
      <SettingsIntegrationCard
        title={t("steam_history_title")}
        logo={<SteamLogo />}
        status={cardStatus}
        statusTone={statusTone}
        actions={renderActions()}
      >
        {isConnected ? renderConnected() : renderConnectForm()}
      </SettingsIntegrationCard>

      <ConfirmationModal
        visible={disconnect !== null}
        title={t("steam_history_disconnect_title")}
        descriptionText={t("steam_history_disconnect_description")}
        confirmButtonLabel={t("integration_disconnect")}
        cancelButtonLabel={t("cancel")}
        confirmButtonTheme="danger"
        buttonsIsDisabled={isBusy}
        onConfirm={() => void handleDisconnect()}
        onClose={() => setDisconnect(null)}
      >
        {disconnect && disconnect.removable > 0 && (
          <CheckboxField
            label={t("steam_history_disconnect_remove", {
              count: disconnect.removable,
            })}
            checked={disconnect.remove}
            onChange={() =>
              setDisconnect({ ...disconnect, remove: !disconnect.remove })
            }
          />
        )}
      </ConfirmationModal>

      {removeImportsModal}
    </>
  );
}
