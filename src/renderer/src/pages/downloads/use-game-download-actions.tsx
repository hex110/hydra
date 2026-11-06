import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { CheckboxField, ConfirmationModal } from "@renderer/components";
import { useDownload, useLibrary } from "@renderer/hooks";
import type { GameShop, LibraryGame } from "@types";

type Target = { shop: GameShop; objectId: string };

/**
 * What the Downloads page does to game downloads, with the dialogs those
 * actions need. Render `modals` once on the page.
 */
export function useGameDownloadActions() {
  const { t } = useTranslation("downloads");
  const { downloadLibrary, updateLibrary } = useLibrary();
  const {
    lastPacket,
    pauseDownload: pauseDownloadOriginal,
    resumeDownload: resumeDownloadOriginal,
    cancelDownload,
  } = useDownload();

  const [optimisticallyResumed, setOptimisticallyResumed] = useState<
    Record<string, boolean>
  >({});
  const [pauseWarningTarget, setPauseWarningTarget] = useState<Target | null>(
    null
  );
  const [cancelTarget, setCancelTarget] = useState<Target | null>(null);
  const [keepCancelledFiles, setKeepCancelledFiles] = useState(false);

  const clearOptimistic = useCallback((gameId: string) => {
    setOptimisticallyResumed((previous) => {
      if (!previous[gameId]) return previous;
      const next = { ...previous };
      delete next[gameId];
      return next;
    });
  }, []);

  // The real download has started, or the game is no longer active.
  useEffect(() => {
    setOptimisticallyResumed((previous) => {
      const next = { ...previous };
      let changed = false;

      for (const gameId of Object.keys(next)) {
        const game = downloadLibrary.find((item) => item.id === gameId);
        if (
          !game ||
          game.download?.status !== "active" ||
          lastPacket?.gameId === gameId
        ) {
          delete next[gameId];
          changed = true;
        }
      }

      return changed ? next : previous;
    });
  }, [downloadLibrary, lastPacket?.gameId]);

  const isGameDownloading = useCallback(
    (game: LibraryGame) =>
      lastPacket?.gameId === game.id || optimisticallyResumed[game.id] === true,
    [lastPacket?.gameId, optimisticallyResumed]
  );

  const resume = useCallback(
    async (shop: GameShop, objectId: string) => {
      const gameId = `${shop}:${objectId}`;
      setOptimisticallyResumed((previous) => ({ ...previous, [gameId]: true }));

      try {
        if (!(await resumeDownloadOriginal(shop, objectId))) {
          clearOptimistic(gameId);
        }
      } catch (error) {
        clearOptimistic(gameId);
        throw error;
      }
    },
    [clearOptimistic, resumeDownloadOriginal]
  );

  const performPause = useCallback(
    async (shop: GameShop, objectId: string, confirmed = false) => {
      const paused = await pauseDownloadOriginal(shop, objectId, confirmed);
      if (paused) clearOptimistic(`${shop}:${objectId}`);
    },
    [clearOptimistic, pauseDownloadOriginal]
  );

  const pause = useCallback(
    async (shop: GameShop, objectId: string) => {
      if (await window.electron.getDownloadPauseWarning(shop, objectId)) {
        setPauseWarningTarget({ shop, objectId });
        return;
      }
      await performPause(shop, objectId);
    },
    [performPause]
  );

  const requestCancel = useCallback((shop: GameShop, objectId: string) => {
    setKeepCancelledFiles(false);
    setCancelTarget({ shop, objectId });
  }, []);

  const move = useCallback(
    async (shop: GameShop, objectId: string, direction: "up" | "down") => {
      await window.electron.updateDownloadQueuePosition(
        shop,
        objectId,
        direction
      );
      updateLibrary();
    },
    [updateLibrary]
  );

  const dismiss = useCallback(
    async (games: LibraryGame[]) => {
      await window.electron.dismissDownloads(
        games.map(({ shop, objectId }) => ({ shop, objectId }))
      );
      updateLibrary();
    },
    [updateLibrary]
  );

  const extract = useCallback(
    async (shop: GameShop, objectId: string) => {
      await window.electron.extractGameDownload(shop, objectId);
      updateLibrary();
    },
    [updateLibrary]
  );

  const modals: ReactNode = (
    <>
      <ConfirmationModal
        visible={pauseWarningTarget !== null}
        title={t("generated_zip_pause_title")}
        descriptionText={t("generated_zip_pause_message")}
        confirmButtonLabel={t("pause")}
        cancelButtonLabel={t("generated_zip_keep_downloading")}
        onConfirm={async () => {
          const target = pauseWarningTarget;
          setPauseWarningTarget(null);
          if (target) await performPause(target.shop, target.objectId, true);
        }}
        onClose={() => setPauseWarningTarget(null)}
      />

      <ConfirmationModal
        visible={cancelTarget !== null}
        title={t("cancel_download")}
        descriptionText={
          keepCancelledFiles
            ? t("cancel_download_keep_files_description")
            : t("cancel_download_description")
        }
        confirmButtonLabel={t("yes_cancel")}
        cancelButtonLabel={t("keep_downloading")}
        confirmButtonTheme="danger"
        onConfirm={async () => {
          const target = cancelTarget;
          setCancelTarget(null);
          if (target) {
            await cancelDownload(
              target.shop,
              target.objectId,
              keepCancelledFiles
            );
          }
        }}
        onClose={() => setCancelTarget(null)}
      >
        <CheckboxField
          label={t("keep_downloaded_files")}
          checked={keepCancelledFiles}
          onChange={(event) => setKeepCancelledFiles(event.target.checked)}
        />
      </ConfirmationModal>
    </>
  );

  return {
    isGameDownloading,
    pause,
    resume,
    requestCancel,
    move,
    dismiss,
    extract,
    modals,
  };
}

export type GameDownloadActions = ReturnType<typeof useGameDownloadActions>;
