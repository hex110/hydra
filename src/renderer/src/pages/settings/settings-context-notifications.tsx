import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { Button, CheckboxField, SelectField } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import {
  useAppSelector,
  useGlobalLeaderboardsFeature,
  useUserDetails,
} from "@renderer/hooks";
import { logger } from "@renderer/logger";
import type {
  AchievementCustomNotificationPosition,
  UserPreferences,
} from "@types";
import { UnmuteIcon } from "@primer/octicons-react";
import {
  isNotificationPreferenceEnabled,
  resolveInGameNotices,
  type NotificationPreferenceKey,
} from "@shared";

import "./settings-general.scss";

const notificationSwitch = (
  preferences: UserPreferences | null,
  key: NotificationPreferenceKey
) => isNotificationPreferenceEnabled(preferences, key);

const buildForm = (preferences: UserPreferences | null) => ({
  downloadNotificationsEnabled: notificationSwitch(
    preferences,
    "downloadNotificationsEnabled"
  ),
  repackUpdatesNotificationsEnabled: notificationSwitch(
    preferences,
    "repackUpdatesNotificationsEnabled"
  ),
  wishlistNotificationsEnabled: notificationSwitch(
    preferences,
    "wishlistNotificationsEnabled"
  ),
  gameUpdateNotificationsEnabled: notificationSwitch(
    preferences,
    "gameUpdateNotificationsEnabled"
  ),
  gameToolNotificationsEnabled: notificationSwitch(
    preferences,
    "gameToolNotificationsEnabled"
  ),
  saveImportNotificationsEnabled: notificationSwitch(
    preferences,
    "saveImportNotificationsEnabled"
  ),
  friendRequestNotificationsEnabled: notificationSwitch(
    preferences,
    "friendRequestNotificationsEnabled"
  ),
  friendStartGameNotificationsEnabled: notificationSwitch(
    preferences,
    "friendStartGameNotificationsEnabled"
  ),
  chatMessageNotificationsEnabled: notificationSwitch(
    preferences,
    "chatMessageNotificationsEnabled"
  ),
  leaderboardSlamEnabled: preferences?.leaderboardSlamEnabled ?? true,
  leaderboardDropNotificationsEnabled:
    preferences?.leaderboardDropNotificationsEnabled ?? true,
  achievementNotificationsEnabled:
    preferences?.achievementNotificationsEnabled ?? true,
  achievementCustomNotificationsEnabled:
    preferences?.achievementCustomNotificationsEnabled ?? true,
  achievementCustomNotificationPosition:
    (preferences?.achievementCustomNotificationPosition ??
      "top-left") as AchievementCustomNotificationPosition,
  inGameNotices: preferences?.inGameNotices,
  achievementSoundVolume: Math.round(
    (preferences?.achievementSoundVolume ?? 0.15) * 100
  ),
});

export function SettingsContextNotifications() {
  const { t } = useTranslation("settings");
  const { updateUserPreferences } = useContext(settingsContext);

  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );

  const volumeUpdateTimeoutRef = useRef<NodeJS.Timeout>();

  const [form, setForm] = useState(() => buildForm(userPreferences));
  const isLinux = window.electron.platform === "linux";
  const [mangohudAvailable, setMangohudAvailable] = useState(false);

  useEffect(() => {
    if (!isLinux) return;
    window.electron
      .isMangohudAvailable()
      .then(setMangohudAvailable)
      .catch(() => setMangohudAvailable(false));
  }, [isLinux]);

  const { userDetails, patchUser } = useUserDetails();
  const { isEnabled: isGlobalLeaderboardsEnabled } =
    useGlobalLeaderboardsFeature();
  const savedLeaderboardNotifications =
    userDetails?.allowLeaderboardNotifications ?? true;
  const [leaderboardNotifications, setLeaderboardNotifications] = useState(
    savedLeaderboardNotifications
  );

  useEffect(() => {
    setLeaderboardNotifications(savedLeaderboardNotifications);
  }, [savedLeaderboardNotifications]);

  const toggleLeaderboardNotifications = async () => {
    const next = !leaderboardNotifications;
    setLeaderboardNotifications(next);
    try {
      await patchUser({ allowLeaderboardNotifications: next });
    } catch (error) {
      logger.error("Failed to update leaderboard notifications", error);
      setLeaderboardNotifications(!next);
    }
  };

  const hintedLabel = (label: string, hint: string) => (
    <span className="settings-general__hinted-label">
      {label}
      <small>{hint}</small>
    </span>
  );

  useEffect(() => {
    if (!userPreferences) return;

    setForm((prev) => ({ ...prev, ...buildForm(userPreferences) }));
  }, [userPreferences]);

  useEffect(() => {
    return () => {
      if (volumeUpdateTimeoutRef.current) {
        clearTimeout(volumeUpdateTimeoutRef.current);
      }
    };
  }, []);

  const handleChange = async (values: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...values }));
    await updateUserPreferences(values);
  };

  const handleVolumeChange = useCallback(
    (newVolume: number) => {
      setForm((prev) => ({ ...prev, achievementSoundVolume: newVolume }));

      if (volumeUpdateTimeoutRef.current) {
        clearTimeout(volumeUpdateTimeoutRef.current);
      }

      volumeUpdateTimeoutRef.current = setTimeout(() => {
        updateUserPreferences({ achievementSoundVolume: newVolume / 100 });
      }, 300);
    },
    [updateUserPreferences]
  );

  const achievementCustomNotificationPositionOptions = useMemo(() => {
    return [
      "top-left",
      "top-center",
      "top-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ].map((position) => ({
      key: position,
      value: position,
      label: t(position),
    }));
  }, [t]);

  const handleChangeAchievementCustomNotificationPosition = async (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = event.target.value as AchievementCustomNotificationPosition;

    await handleChange({ achievementCustomNotificationPosition: value });
    window.electron.updateAchievementCustomNotificationWindow();
  };

  return (
    <div className="settings-context-panel">
      <div className="settings-context-panel__group">
        <h3>{t("library_notifications")}</h3>
        <p className="settings-context-panel__description">
          {t("notification_switches_hint")}
        </p>

        <CheckboxField
          label={t("enable_download_notifications")}
          checked={form.downloadNotificationsEnabled}
          onChange={() =>
            handleChange({
              downloadNotificationsEnabled: !form.downloadNotificationsEnabled,
            })
          }
        />

        <CheckboxField
          label={t("enable_repack_list_notifications")}
          checked={form.repackUpdatesNotificationsEnabled}
          onChange={() =>
            handleChange({
              repackUpdatesNotificationsEnabled:
                !form.repackUpdatesNotificationsEnabled,
            })
          }
        />

        <CheckboxField
          label={t("enable_wishlist_notifications")}
          checked={form.wishlistNotificationsEnabled}
          onChange={() =>
            handleChange({
              wishlistNotificationsEnabled: !form.wishlistNotificationsEnabled,
            })
          }
        />

        <CheckboxField
          label={t("enable_game_update_notifications")}
          checked={form.gameUpdateNotificationsEnabled}
          onChange={() =>
            handleChange({
              gameUpdateNotificationsEnabled:
                !form.gameUpdateNotificationsEnabled,
            })
          }
        />

        <CheckboxField
          label={t("enable_game_tool_notifications")}
          checked={form.gameToolNotificationsEnabled}
          onChange={() =>
            handleChange({
              gameToolNotificationsEnabled: !form.gameToolNotificationsEnabled,
            })
          }
        />

        <CheckboxField
          label={t("enable_save_import_notifications")}
          checked={form.saveImportNotificationsEnabled}
          onChange={() =>
            handleChange({
              saveImportNotificationsEnabled:
                !form.saveImportNotificationsEnabled,
            })
          }
        />

        <CheckboxField
          label={t("enable_friend_request_notifications")}
          checked={form.friendRequestNotificationsEnabled}
          onChange={() =>
            handleChange({
              friendRequestNotificationsEnabled:
                !form.friendRequestNotificationsEnabled,
            })
          }
        />

        <CheckboxField
          label={t("enable_friend_start_game_notifications")}
          checked={form.friendStartGameNotificationsEnabled}
          onChange={() =>
            handleChange({
              friendStartGameNotificationsEnabled:
                !form.friendStartGameNotificationsEnabled,
            })
          }
        />

        <CheckboxField
          label={t("enable_chat_message_notifications")}
          checked={form.chatMessageNotificationsEnabled}
          onChange={() =>
            handleChange({
              chatMessageNotificationsEnabled:
                !form.chatMessageNotificationsEnabled,
            })
          }
        />
      </div>

      {userDetails && isGlobalLeaderboardsEnabled && (
        <div className="settings-context-panel__group">
          <h3>{t("leaderboard_notifications")}</h3>

          <CheckboxField
            label={hintedLabel(
              t("enable_leaderboard_notifications"),
              t("enable_leaderboard_notifications_hint")
            )}
            checked={leaderboardNotifications}
            onChange={toggleLeaderboardNotifications}
          />

          <CheckboxField
            label={hintedLabel(
              t("enable_leaderboard_slam"),
              t("enable_leaderboard_slam_hint")
            )}
            checked={leaderboardNotifications && form.leaderboardSlamEnabled}
            disabled={!leaderboardNotifications}
            onChange={() =>
              handleChange({
                leaderboardSlamEnabled: !form.leaderboardSlamEnabled,
              })
            }
          />

          <CheckboxField
            label={hintedLabel(
              t("enable_leaderboard_drop_notifications"),
              t("enable_leaderboard_drop_notifications_hint")
            )}
            checked={
              leaderboardNotifications &&
              form.leaderboardDropNotificationsEnabled
            }
            disabled={!leaderboardNotifications}
            onChange={() =>
              handleChange({
                leaderboardDropNotificationsEnabled:
                  !form.leaderboardDropNotificationsEnabled,
              })
            }
          />
        </div>
      )}

      <div className="settings-context-panel__group">
        <h3>{t("achievement_notifications")}</h3>

        <CheckboxField
          label={t("enable_achievement_notifications")}
          checked={form.achievementNotificationsEnabled}
          onChange={async () => {
            await handleChange({
              achievementNotificationsEnabled:
                !form.achievementNotificationsEnabled,
            });

            window.electron.updateAchievementCustomNotificationWindow();
          }}
        />

        {isLinux && (
          <CheckboxField
            label={hintedLabel(
              t("enable_in_game_notices"),
              mangohudAvailable
                ? t("enable_in_game_notices_hint")
                : t("enable_in_game_notices_no_mangohud")
            )}
            checked={resolveInGameNotices(
              form.inGameNotices,
              mangohudAvailable
            )}
            disabled={
              !mangohudAvailable || !form.achievementNotificationsEnabled
            }
            onChange={() =>
              handleChange({
                inGameNotices: !resolveInGameNotices(
                  form.inGameNotices,
                  mangohudAvailable
                ),
              })
            }
          />
        )}

        <CheckboxField
          label={t("enable_achievement_custom_notifications")}
          checked={form.achievementCustomNotificationsEnabled}
          disabled={!form.achievementNotificationsEnabled}
          onChange={async () => {
            await handleChange({
              achievementCustomNotificationsEnabled:
                !form.achievementCustomNotificationsEnabled,
            });

            window.electron.updateAchievementCustomNotificationWindow();
          }}
        />

        {form.achievementNotificationsEnabled &&
          form.achievementCustomNotificationsEnabled && (
            <>
              <SelectField
                className="settings-general__achievement-custom-notification-position__select-variation"
                label={t("achievement_custom_notification_position")}
                value={form.achievementCustomNotificationPosition}
                onChange={handleChangeAchievementCustomNotificationPosition}
                options={achievementCustomNotificationPositionOptions}
              />

              <Button
                className="settings-general__test-achievement-notification-button"
                onClick={() =>
                  window.electron.showAchievementTestNotification()
                }
              >
                {t("test_notification")}
              </Button>
            </>
          )}

        {form.achievementNotificationsEnabled && (
          <div className="settings-general__volume-control">
            <label htmlFor="achievement-volume">
              {t("achievement_sound_volume")}
            </label>
            <div className="settings-general__volume-slider-wrapper">
              <UnmuteIcon size={16} className="settings-general__volume-icon" />
              <input
                id="achievement-volume"
                type="range"
                min="0"
                max="100"
                value={form.achievementSoundVolume}
                onChange={(e) => {
                  const volumePercent = parseInt(e.target.value, 10);
                  if (!isNaN(volumePercent)) {
                    handleVolumeChange(volumePercent);
                  }
                }}
                className="settings-general__volume-slider"
                style={
                  {
                    "--volume-percent": `${form.achievementSoundVolume}%`,
                  } as React.CSSProperties
                }
              />
              <span className="settings-general__volume-value">
                {form.achievementSoundVolume}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
