import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  BackgroundTask,
  BackgroundTaskKind,
  IntegrationStatuses,
  LibraryImportSource,
} from "@types";
import { ConfirmationModal } from "@renderer/components";
import { useToast } from "@renderer/hooks";

/** Last sync, last error and running tasks for the tracking integrations. */
export function useTrackingStatus() {
  const [statuses, setStatuses] = useState<IntegrationStatuses | null>(null);
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);

  const refresh = useCallback(() => {
    window.electron
      .getIntegrationStatuses()
      .then(setStatuses)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    window.electron
      .getBackgroundTasks()
      .then(setTasks)
      .catch(() => {});

    const unsubscribeStatus =
      window.electron.onIntegrationStatusChanged(refresh);
    const unsubscribeTasks = window.electron.onBackgroundTasksChanged(setTasks);
    return () => {
      unsubscribeStatus();
      unsubscribeTasks();
    };
  }, [refresh]);

  const task = (id: BackgroundTaskKind) =>
    tasks.find((item) => item.id === id) ?? null;
  const isRunning = (id: BackgroundTaskKind) => {
    const state = task(id)?.state;
    return state === "running" || state === "queued";
  };

  return { statuses, task, isRunning };
}

export function IntegrationSection({
  title,
  description,
  children,
}: Readonly<{ title: string; description?: string; children: ReactNode }>) {
  return (
    <section className="settings-integration-card__section">
      <h4 className="settings-integration-card__section-title">{title}</h4>
      {description && (
        <p className="settings-integration-card__description">{description}</p>
      )}
      {children}
    </section>
  );
}

/**
 * Asks whether to remove the library entries an import added, when the user
 * turns that import off. Does nothing when there is nothing to remove.
 */
export function useRemoveImportsPrompt() {
  const { t } = useTranslation("settings");
  const { showSuccessToast, showErrorToast } = useToast();
  const [prompt, setPrompt] = useState<{
    source: LibraryImportSource;
    count: number;
  } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const offerRemoval = useCallback(async (source: LibraryImportSource) => {
    const count = await window.electron
      .countRemovableImports(source)
      .catch(() => 0);
    if (count > 0) setPrompt({ source, count });
  }, []);

  const remove = async () => {
    if (!prompt) return;
    setIsRemoving(true);

    try {
      const removed = await window.electron.removeImportedGames(prompt.source);
      showSuccessToast(t("tracking_imports_removed", { count: removed }));
    } catch {
      showErrorToast(t("tracking_imports_remove_failed"));
    } finally {
      setIsRemoving(false);
      setPrompt(null);
    }
  };

  const modal = (
    <ConfirmationModal
      visible={prompt !== null}
      title={t("tracking_remove_imports_title")}
      descriptionText={t(
        `tracking_remove_imports_${prompt?.source ?? "floppy"}`,
        {
          count: prompt?.count ?? 0,
        }
      )}
      confirmButtonLabel={t("tracking_remove_imports_confirm", {
        count: prompt?.count ?? 0,
      })}
      cancelButtonLabel={t("tracking_keep_imports")}
      confirmButtonTheme="danger"
      buttonsIsDisabled={isRemoving}
      onConfirm={() => void remove()}
      onClose={() => setPrompt(null)}
    />
  );

  return { offerRemoval, modal };
}
