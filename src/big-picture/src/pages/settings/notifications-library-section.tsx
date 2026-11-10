import "./notifications-library-section.scss";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Checkbox, VerticalFocusGroup } from "../../components";
import { useUserPreferences } from "../../hooks";
import type { FocusOverrideTarget, FocusOverrides } from "../../services";
import {
  NOTIFICATIONS_LIBRARY_ITEM_FOCUS_IDS,
  NOTIFICATIONS_LIBRARY_SECTION_REGION_ID,
  SETTINGS_HEADER_RETURN_TARGET,
} from "./settings-navigation";
import { SettingsSection } from "./settings-section";
import type { UserPreferences } from "@types";
import {
  isNotificationPreferenceEnabled,
  type NotificationPreferenceKey,
} from "@shared";

interface NotificationsLibrarySectionProps {
  className?: string;
  lastItemDownTarget?: FocusOverrideTarget;
}

/** In display order; the last one is the achievements section's up target. */
const LIBRARY_SWITCHES = [
  {
    key: "downloadNotificationsEnabled",
    id: "download-notifications-enabled",
    label: "enable_download_notifications",
  },
  {
    key: "repackUpdatesNotificationsEnabled",
    id: "repack-updates-notifications-enabled",
    label: "enable_repack_list_notifications",
  },
  {
    key: "wishlistNotificationsEnabled",
    id: "wishlist-notifications-enabled",
    label: "enable_wishlist_notifications",
  },
  {
    key: "gameUpdateNotificationsEnabled",
    id: "game-update-notifications-enabled",
    label: "enable_game_update_notifications",
  },
  {
    key: "gameToolNotificationsEnabled",
    id: "game-tool-notifications-enabled",
    label: "enable_game_tool_notifications",
  },
  {
    key: "saveImportNotificationsEnabled",
    id: "save-import-notifications-enabled",
    label: "enable_save_import_notifications",
  },
  {
    key: "friendRequestNotificationsEnabled",
    id: "friend-request-notifications-enabled",
    label: "enable_friend_request_notifications",
  },
  {
    key: "friendStartGameNotificationsEnabled",
    id: "friend-start-game-notifications-enabled",
    label: "enable_friend_start_game_notifications",
  },
] as const satisfies readonly {
  key: NotificationPreferenceKey &
    keyof typeof NOTIFICATIONS_LIBRARY_ITEM_FOCUS_IDS;
  id: string;
  label: string;
}[];

type LibrarySwitchKey = (typeof LIBRARY_SWITCHES)[number]["key"];
type NotificationsLibraryForm = Record<LibrarySwitchKey, boolean>;

interface NotificationsLibraryItem {
  id: string;
  focusId: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const buildForm = (
  preferences: UserPreferences | null
): NotificationsLibraryForm =>
  Object.fromEntries(
    LIBRARY_SWITCHES.map(({ key }) => [
      key,
      isNotificationPreferenceEnabled(preferences, key),
    ])
  ) as NotificationsLibraryForm;

export function NotificationsLibrarySection({
  className,
  lastItemDownTarget,
}: Readonly<NotificationsLibrarySectionProps>) {
  const { t } = useTranslation("settings");
  const userPreferences = useUserPreferences();
  const [form, setForm] = useState<NotificationsLibraryForm>(() =>
    buildForm(userPreferences)
  );

  useEffect(() => {
    if (!userPreferences) return;

    setForm(buildForm(userPreferences));
  }, [userPreferences]);

  const updateUserPreferences = async (
    values: Partial<NotificationsLibraryForm>
  ) => {
    const nextForm = { ...form, ...values };
    setForm(nextForm);

    await globalThis.window.electron.updateUserPreferences(values);
  };

  const items = useMemo<NotificationsLibraryItem[]>(
    () =>
      LIBRARY_SWITCHES.map(({ key, id, label }) => ({
        id,
        focusId: NOTIFICATIONS_LIBRARY_ITEM_FOCUS_IDS[key],
        label: t(label),
        checked: form[key],
        onChange: (checked: boolean) =>
          void updateUserPreferences({ [key]: checked }),
      })),
    [form, t]
  );

  const navigationOverridesByFocusId = useMemo<
    Record<string, FocusOverrides>
  >(() => {
    return Object.fromEntries(
      items.map((item, index) => {
        const previousItem = items[index - 1];
        const nextItem = items[index + 1];

        return [
          item.focusId,
          {
            up: previousItem
              ? {
                  type: "item",
                  itemId: previousItem.focusId,
                }
              : SETTINGS_HEADER_RETURN_TARGET,
            down: nextItem
              ? {
                  type: "item",
                  itemId: nextItem.focusId,
                }
              : lastItemDownTarget,
          } satisfies FocusOverrides,
        ];
      })
    );
  }, [items, lastItemDownTarget]);

  return (
    <SettingsSection
      title={t("library_notifications")}
      description={t("notification_switches_hint")}
      className={className}
    >
      <VerticalFocusGroup
        regionId={NOTIFICATIONS_LIBRARY_SECTION_REGION_ID}
        asChild
      >
        <div className="notifications-library-section__content">
          {items.map((item) => (
            <Checkbox
              key={item.id}
              id={item.id}
              label={item.label}
              checked={item.checked}
              focusId={item.focusId}
              navigationOverrides={navigationOverridesByFocusId[item.focusId]}
              block
              onChange={item.onChange}
            />
          ))}
        </div>
      </VerticalFocusGroup>
    </SettingsSection>
  );
}
