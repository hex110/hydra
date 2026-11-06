import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { BackgroundTask } from "@types";

import { useTaskErrorMessage } from "./use-task-error-message";

/** The words for a background task row: its name, kind and one-line state. */
export function useTaskText() {
  const { t } = useTranslation("downloads");
  const taskErrorMessage = useTaskErrorMessage();

  const key = (task: BackgroundTask) =>
    `task_${task.id.replaceAll("-", "_")}${task.dryRun ? "_preview" : ""}`;

  return useMemo(
    () => ({
      title: (task: BackgroundTask) => t(key(task), { ...task.params }),
      badge: (task: BackgroundTask) => {
        if (task.id.startsWith("steam-")) return t("badge_steam");
        if (task.id.startsWith("floppy-")) return t("badge_floppy");
        return t(`badge_${task.id.replaceAll("-", "_")}`);
      },
      status: (task: BackgroundTask) => {
        if (task.state === "failed") {
          return taskErrorMessage(task.id, task.error);
        }
        if (task.state === "queued") {
          return t("task_floppy_push_queued", { count: task.total ?? 0 });
        }
        if (task.state === "running") {
          return task.total === null
            ? t("task_starting")
            : t("task_progress", {
                processed: task.processed,
                total: task.total,
              });
        }

        return t(`${key(task)}_done`, { ...task.params, ...task.result });
      },
    }),
    [t, taskErrorMessage]
  );
}
