import { db, levelKeys } from "@main/level";
import type {
  BackgroundTaskError,
  IntegrationName,
  IntegrationStatuses,
} from "@types";

import { WindowManager } from "./window-manager";

type SyncTimes = Partial<Record<IntegrationName, number>>;

const lastErrors = new Map<IntegrationName, BackgroundTaskError>();

const readSyncTimes = () =>
  db
    .get<string, SyncTimes>(levelKeys.integrationSyncTimes, {
      valueEncoding: "json",
    })
    .catch((): SyncTimes => ({}));

const notify = () =>
  WindowManager.sendToAppWindows("on-integration-status-changed");

export const getIntegrationStatuses =
  async (): Promise<IntegrationStatuses> => {
    const times = await readSyncTimes();
    const status = (name: IntegrationName) => ({
      lastSyncedAt: times[name] ?? null,
      lastError: lastErrors.get(name) ?? null,
    });

    return {
      steamHistory: status("steamHistory"),
      steamWishlist: status("steamWishlist"),
      floppy: status("floppy"),
      cloud: status("cloud"),
    };
  };

export const markIntegrationSynced = async (name: IntegrationName) => {
  lastErrors.delete(name);
  const times = await readSyncTimes();
  await db.put<string, SyncTimes>(
    levelKeys.integrationSyncTimes,
    { ...times, [name]: Date.now() },
    { valueEncoding: "json" }
  );
  notify();
};

export const markIntegrationFailed = (
  name: IntegrationName,
  reason: BackgroundTaskError
) => {
  lastErrors.set(name, reason);
  notify();
};

/** Forgets an integration's state when it is disconnected. */
export const resetIntegrationStatus = async (name: IntegrationName) => {
  lastErrors.delete(name);
  const { [name]: _removed, ...times } = await readSyncTimes();
  await db.put<string, SyncTimes>(levelKeys.integrationSyncTimes, times, {
    valueEncoding: "json",
  });
  notify();
};
