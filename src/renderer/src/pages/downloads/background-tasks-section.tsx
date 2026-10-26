import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { XIcon } from "@primer/octicons-react";
import type { BackgroundTask } from "@types";

import "./background-tasks-section.scss";

const TASK_ORDER = [
  "steam-history",
  "floppy-sync",
  "floppy-pull",
  "floppy-import",
  "floppy-push",
] as const;

export function BackgroundTasksSection() {
  const { t } = useTranslation("downloads");
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
    if (task.state === "failed") return t("task_failed");
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

  return (
    <section className="background-tasks">
      <h2>{t("background_tasks")}</h2>
      <ul className="background-tasks__list">
        {sorted.map((task) => (
          <li key={task.id} className="background-tasks__item">
            <div className="background-tasks__details">
              <strong>{title(task)}</strong>
              <span className="background-tasks__muted">{detail(task)}</span>
              {task.state === "running" && task.total !== null && (
                <progress
                  className="background-tasks__progress"
                  max={Math.max(task.total, 1)}
                  value={task.processed}
                />
              )}
            </div>
            {(task.state === "done" || task.state === "failed") && (
              <button
                type="button"
                className="background-tasks__dismiss"
                aria-label={t("task_dismiss")}
                onClick={() =>
                  void window.electron.dismissBackgroundTask(task.id)
                }
              >
                <XIcon size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
