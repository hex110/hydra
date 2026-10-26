import { isAxiosError } from "axios";

import { SaveStoreConflictError } from "./save-store/self-hosted-save-store.js";

export const isCloudSaveCommitTransportFailure = (error: unknown) =>
  (isAxiosError(error) && !error.response) ||
  (!isAxiosError(error) &&
    error instanceof Error &&
    /Request failed with|ECONN|ETIMEDOUT|timeout|socket hang up/i.test(
      error.message
    ));

export const shouldReprepareCloudSaveSnapshot = (error: unknown) => {
  if (
    error instanceof Error &&
    error.message.includes("cloud_save_upload_url_expired")
  ) {
    return true;
  }
  if (!isAxiosError(error)) return false;
  const payload = JSON.stringify(error.response?.data ?? "");
  return (
    payload.includes("game/cloud-save-pending-snapshot-expired") ||
    payload.includes("game/cloud-save-pending-snapshot-incomplete") ||
    payload.includes("game/cloud-save-pending-snapshot-not-found")
  );
};

export const shouldRetryCloudSaveConflict = (error: unknown, attempt: number) =>
  attempt === 0 &&
  ((isAxiosError(error) && error.response?.status === 409) ||
    error instanceof SaveStoreConflictError);

export const shouldRetryCloudSaveStateChange = (attempt: number) =>
  attempt === 0;
