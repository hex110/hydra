import { registerEvent } from "../register-event";
import { t } from "i18next";
import { notify } from "@main/services/notifications/notify";

const publishNewRepacksNotification = async (
  _event: Electron.IpcMainInvokeEvent,
  newRepacksCount: number
) => {
  if (newRepacksCount < 1) return;

  await notify({
    type: null,
    title: t("repack_list_updated", { ns: "notifications" }),
    body: t("repack_count", { ns: "notifications", count: newRepacksCount }),
    preference: "repackUpdatesNotificationsEnabled",
    target: { kind: "path", path: "/catalogue" },
  });
};

registerEvent("publishNewRepacksNotification", publishNewRepacksNotification);
