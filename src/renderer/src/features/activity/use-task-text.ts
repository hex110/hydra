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
      title: (task: BackgroundTask) => t(key(task)),
      badge: (task: BackgroundTask) =>
        t(task.id.startsWith("steam") ? "badge_steam" : "badge_floppy"),
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

        return t(`${key(task)}_done`, { ...task.result });
      },
    }),
    [t, taskErrorMessage]
  );
}
