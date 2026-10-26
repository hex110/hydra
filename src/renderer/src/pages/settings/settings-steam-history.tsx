import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, CheckboxField, TextField } from "@renderer/components";
import { useAppSelector, useToast } from "@renderer/hooks";
import { settingsContext } from "@renderer/context";
import type { SteamHistorySyncStatus } from "@types";

import "./settings-floppy.scss";

const MIN_PLAYTIME_OPTIONS = [0, 1, 30, 60] as const;

export function SettingsSteamHistory() {
  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );
  const { updateUserPreferences } = useContext(settingsContext);
  const { showSuccessToast, showErrorToast } = useToast();
  const { t } = useTranslation("settings");

  const [isBusy, setIsBusy] = useState(false);
  const [preview, setPreview] = useState<{
    owned: number;
    wouldAdd: number;
    alreadyInLibrary: number;
  } | null>(null);
  const [status, setStatus] = useState<SteamHistorySyncStatus | null>(null);
  const [form, setForm] = useState(() => ({
    apiKey: userPreferences?.steamHistoryApiKey ?? "",
    steamId: userPreferences?.steamHistorySteamId ?? "",
  }));

  useEffect(() => {
    if (!userPreferences) return;
    setForm({
      apiKey: userPreferences.steamHistoryApiKey ?? "",
      steamId: userPreferences.steamHistorySteamId ?? "",
    });
  }, [userPreferences]);

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
  }, [status?.running]);

  const isSaved = Boolean(
    userPreferences?.steamHistoryApiKey && userPreferences.steamHistorySteamId
  );

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (
    event
  ) => {
    event.preventDefault();
    setIsBusy(true);

    try {
      const { ownedGames } = await window.electron.testSteamHistoryConnection(
        form.apiKey,
        form.steamId
      );
      await updateUserPreferences({
        steamHistoryApiKey: form.apiKey,
        steamHistorySteamId: form.steamId,
      });
      showSuccessToast(t("steam_history_connected", { count: ownedGames }));
    } catch {
      showErrorToast(t("steam_history_connection_failed"));
    } finally {
      setIsBusy(false);
    }
  };

  const handlePreview = async () => {
    setIsBusy(true);

    try {
      setPreview(
        await window.electron.previewSteamLibraryImport(
          userPreferences?.steamHistoryMinMinutes ?? 30
        )
      );
    } catch {
      showErrorToast(t("steam_history_sync_failed"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleSync = async () => {
    try {
      setStatus(await window.electron.syncSteamHistory());
    } catch {
      showErrorToast(t("steam_history_sync_failed"));
    }
  };

  const renderStatus = () => {
    if (!status) return null;
    if (status.running) {
      return t("steam_history_progress", {
        processed: status.processed,
        total: status.total,
      });
    }
    if (status.error) return t("steam_history_sync_failed");
    if (!status.finishedAt) return null;

    return t("steam_history_result", {
      games: status.total,
      added: status.gamesAdded,
      achievements: status.gamesWithAchievements,
      days: status.activityDays,
    });
  };

  return (
    <form className="settings-floppy__form" onSubmit={handleSubmit}>
      <h3>{t("steam_history_title")}</h3>
      <p className="settings-floppy__description">
        {t("steam_history_description")}
      </p>

      <TextField
        label={t("steam_history_steam_id")}
        value={form.steamId}
        placeholder="7656119…"
        onChange={(event) => setForm({ ...form, steamId: event.target.value })}
      />
      <TextField
        label={t("steam_history_api_key")}
        value={form.apiKey}
        type="password"
        placeholder={t("steam_history_api_key")}
        onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
        rightContent={
          <Button
            type="submit"
            disabled={isBusy || !form.apiKey || !form.steamId}
          >
            {t("floppy_test_connection")}
          </Button>
        }
      />

      {isSaved && (
        <>
          <CheckboxField
            label={t("steam_history_add_to_library")}
            checked={userPreferences?.steamHistoryAddToLibrary === true}
            onChange={() =>
              updateUserPreferences({
                steamHistoryAddToLibrary:
                  userPreferences?.steamHistoryAddToLibrary !== true,
                steamHistoryMinMinutes:
                  userPreferences?.steamHistoryMinMinutes ?? 30,
              })
            }
          />

          {userPreferences?.steamHistoryAddToLibrary === true && (
            <label className="settings-floppy__select">
              {t("steam_history_min_playtime")}
              <select
                value={userPreferences.steamHistoryMinMinutes ?? 30}
                onChange={(event) => {
                  setPreview(null);
                  void updateUserPreferences({
                    steamHistoryMinMinutes: Number(event.target.value),
                  });
                }}
              >
                {MIN_PLAYTIME_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {t(`steam_history_min_${minutes}`)}
                  </option>
                ))}
              </select>
            </label>
          )}

          {userPreferences?.steamHistoryAddToLibrary === true && (
            <div className="settings-floppy__actions">
              <Button
                type="button"
                theme="outline"
                disabled={isBusy}
                onClick={handlePreview}
              >
                {t("steam_history_preview")}
              </Button>
              <span className="settings-floppy__status">
                {preview
                  ? t("steam_history_preview_result", { ...preview })
                  : null}
              </span>
            </div>
          )}

          <CheckboxField
            label={t("steam_wishlist_track")}
            checked={userPreferences?.steamWishlistTrack === true}
            onChange={() =>
              updateUserPreferences({
                steamWishlistTrack:
                  userPreferences?.steamWishlistTrack !== true,
              })
            }
          />

          {userPreferences?.steamWishlistTrack === true && (
            <>
              <CheckboxField
                label={t("steam_wishlist_add_to_library")}
                checked={userPreferences.steamWishlistAddToLibrary !== false}
                onChange={() =>
                  updateUserPreferences({
                    steamWishlistAddToLibrary:
                      userPreferences.steamWishlistAddToLibrary === false,
                  })
                }
              />
              <CheckboxField
                label={t("steam_wishlist_notify_date")}
                checked={userPreferences.steamWishlistNotifyDate === true}
                onChange={() =>
                  updateUserPreferences({
                    steamWishlistNotifyDate:
                      userPreferences.steamWishlistNotifyDate !== true,
                  })
                }
              />
              <div className="settings-floppy__actions">
                <Button
                  type="button"
                  theme="outline"
                  onClick={() => void window.electron.syncSteamWishlist()}
                >
                  {t("steam_wishlist_check")}
                </Button>
                <span className="settings-floppy__status">
                  {t("steam_wishlist_check_hint")}
                </span>
              </div>
            </>
          )}
        </>
      )}

      {isSaved && (
        <div className="settings-floppy__actions">
          <Button
            type="button"
            disabled={isBusy || status?.running}
            onClick={handleSync}
          >
            {t("steam_history_import")}
          </Button>
          <span className="settings-floppy__status">{renderStatus()}</span>
        </div>
      )}
    </form>
  );
}
