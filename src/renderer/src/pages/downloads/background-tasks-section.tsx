import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SyncIcon } from "@primer/octicons-react";
import type { BackgroundTask } from "@types";
import { ActivityRow, Button } from "@renderer/components";
import { useToast } from "@renderer/hooks";

import { ActivitySection } from "./activity-section";
import { useTaskErrorMessage } from "./use-task-error-message";

const TASK_ORDER = [
  "steam-history",
  "steam-wishlist",
  "floppy-sync",
  "floppy-pull",
  "floppy-import",
  "floppy-push",
] as const;

export function BackgroundTasksSection() {
  const { t } = useTranslation("downloads");
  const { showErrorToast } = useToast();
  const taskErrorMessage = useTaskErrorMessage();
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);

  useEffect(() => {
    window.electron
      .getBackgroundTasks()
      .then(setTasks)
      .catch(() => {});
    return window.electron.onBackgroundTasksChanged(setTasks);
  }, []);

  if (tasks.length === 0) return null;

  const sorted = [...tasks].sort(
    (a, b) => TASK_ORDER.indexOf(a.id) - TASK_ORDER.indexOf(b.id)
  );

  const title = (task: BackgroundTask) =>
    t(`task_${task.id.replaceAll("-", "_")}${task.dryRun ? "_preview" : ""}`);

  const detail = (task: BackgroundTask) => {
    if (task.state === "failed") return taskErrorMessage(task.id, task.error);
    if (task.state === "queued") {
      return t("task_floppy_push_queued", { count: task.total ?? 0 });
    }
    if (task.state === "running") {
      return task.total === null
        ? t("task_starting")
        : t("task_progress", { processed: task.processed, total: task.total });
    }

    return t(
      `task_${task.id.replaceAll("-", "_")}${task.dryRun ? "_preview" : ""}_done`,
      {
        ...task.result,
      }
    );
  };

  const retry = (task: BackgroundTask) => {
    window.electron
      .retryBackgroundTask(task.id)
      .catch(() => showErrorToast(t("task_retry_failed")));
  };

  return (
    <ActivitySection title={t("background_tasks")}>
      {sorted.map((task) => (
        <ActivityRow
          key={task.id}
          title={title(task)}
          icon={<SyncIcon size={20} />}
          badge={t(
            task.id.startsWith("steam") ? "badge_steam" : "badge_floppy"
          )}
          status={detail(task)}
          isError={task.state === "failed"}
          showProgress={task.state === "running"}
          progress={
            task.total === null
              ? null
              : task.processed / Math.max(task.total, 1)
          }
          primary={
            task.state === "failed" ? (
              <Button size="small" onClick={() => retry(task)}>
                <SyncIcon size={14} />
                {t("task_retry")}
              </Button>
            ) : undefined
          }
          onClear={
            task.state === "done" || task.state === "failed"
              ? () => void window.electron.dismissBackgroundTask(task.id)
              : undefined
          }
        />
      ))}
    </ActivitySection>
  );
}
