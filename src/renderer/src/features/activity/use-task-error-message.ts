import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { BackgroundTaskError, BackgroundTaskKind } from "@types";

const serviceOf = (id: BackgroundTaskKind) => {
  if (id.startsWith("steam-")) return "steam";
  if (id.startsWith("floppy-")) return "floppy";
  return null;
};

/** The sentence explaining why a background task failed, worded for its service. */
export function useTaskErrorMessage() {
  const { t } = useTranslation("downloads");

  return useCallback(
    (id: BackgroundTaskKind, error: BackgroundTaskError | null) => {
      const service = serviceOf(id);
      const code = (error ?? "unknown").replaceAll("-", "_");

      if (!service) return t(`task_error_${code}`);

      return t([`task_error_${code}_${service}`, `task_error_${code}`], {
        service: t(`task_service_${service}`),
      });
    },
    [t]
  );
}
