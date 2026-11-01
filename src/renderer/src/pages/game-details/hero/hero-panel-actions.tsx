import {
  AlertIcon,
  CheckIcon,
  DownloadIcon,
  FileIcon,
  GearIcon,
  PlayIcon,
  PlusCircleIcon,
  StarFillIcon,
  StarIcon,
  SyncIcon,
} from "@primer/octicons-react";
import { Button, ConfirmationModal, Modal } from "@renderer/components";
import type { LibraryGame } from "@types";
import {
  canRetryEpicLaunchWithLocalSaves,
  getEpicLaunchError,
  getEpicManagedError,
} from "@renderer/helpers/epic-managed-error";
import cn from "classnames";
import { FileArchive, XCircle } from "lucide-react";
import {
  useDownload,
  useGameExecutablePicker,
  useFinishedDownloadStep,
  useLibrary,
  useToast,
} from "@renderer/hooks";
import { useEpicManagedConnection } from "@renderer/hooks/use-epic-managed";
import { useEpicGameUpdate } from "@renderer/hooks/use-epic-game-update";
import { useCallback, useContext, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { gameDetailsContext } from "@renderer/context";
import { logger } from "@renderer/logger";
import {
  buildGameDetailsPath,
  canDownloadOnSteam,
  handleClassicsLaunchError,
} from "@renderer/helpers";
import { DiscSelectionModal } from "../modals/disc-selection-modal";
import { EpicCloudSaveConflictModal } from "../modals/epic-cloud-save-conflict-modal";

import { useLaunchPhase } from "./use-launch-phase";
import { formatSessionLength, useSessionEnd } from "../use-session-end";
import "./hero-panel-actions.scss";
import { useEffect } from "react";
import {
  getDisplayedPlayTimeInMilliseconds,
  isWishlistOnly,
  isEpicMemberInCurrentScope,
  isEpicUpdateInterrupted,
  isLibraryGameDownloading,
  getEpicLaunchOptions,
  getEpicMemberDownload,
  getOfficialStoreMembers,
  formatReleaseVersion,
  parseReleaseVersion,
} from "@shared";

export function HeroPanelActions() {
  const [toggleLibraryGameDisabled, setToggleLibraryGameDisabled] =
    useState(false);

  const { isGameDeleting, lastPacket, resumeDownload } = useDownload();

  const {
    game,
    downloadGame,
    presentation,
    repacks,
    isGameRunning,
    shop,
    objectId,
    gameTitle,
    shopDetails,
    setShowGameOptionsModal,
    setGameOptionsInitialCategory,
    setShowRepacksModal,
    updateGame,
    selectGameExecutable,
    isTransferring,
    transferProgress,
  } = useContext(gameDetailsContext);

  const isGameDownloading = isLibraryGameDownloading(downloadGame);
  const isWishlistOnlyGame = game ? isWishlistOnly(game) : false;
  const isInLibrary = Boolean(game) && !isWishlistOnlyGame;
  const { installationAvailable: epicInstallationAvailable, connection } =
    useEpicManagedConnection();
  const epicDownload =
    game?.shop === "epic" ? getEpicMemberDownload(game, downloadGame) : null;
  const epicUpdate = useEpicGameUpdate(
    game,
    epicInstallationAvailable && isEpicMemberInCurrentScope(game, connection),
    epicDownload?.status
  );
  const epicUpdateInterrupted =
    !!epicDownload && isEpicUpdateInterrupted(epicDownload);

  const pickGameExecutable = useGameExecutablePicker();
  const finishedDownloadStep = useFinishedDownloadStep(downloadGame);

  const { updateLibrary } = useLibrary();

  const { showSuccessToast, showErrorToast } = useToast();

  const navigate = useNavigate();
  const location = useLocation();

  const [showDiscSelectionModal, setShowDiscSelectionModal] = useState(false);

  useEffect(() => {
    const state = (location.state as Record<string, unknown> | null) ?? {};
    if (!state.openDiscSelection) return;
    if (game?.shop !== "launchbox" || (game?.discs?.length ?? 0) <= 1) return;

    setShowDiscSelectionModal(true);
    navigate(location.pathname + location.search, { replace: true, state: {} });
  }, [location, game?.shop, game?.discs?.length, navigate]);
  const [localSaveRetry, setLocalSaveRetry] = useState<{
    member: LibraryGame;
    skipUpdateCheck: boolean;
  } | null>(null);
  const [epicSaveConflict, setEpicSaveConflict] = useState<LibraryGame | null>(
    null
  );
  const [canRetryOffline, setCanRetryOffline] = useState(false);
  const [canRetryLocalSaves, setCanRetryLocalSaves] = useState(false);
  const officialMembers = getOfficialStoreMembers(
    presentation?.members ?? (game ? [game] : [])
  );
  const [pendingClassicsLaunch, setPendingClassicsLaunch] = useState<{
    discPath: string | undefined;
  } | null>(null);

  const { t } = useTranslation("game_details");
  const { t: tLauncher } = useTranslation("game_launcher");
  const [launching, setLaunching] = useState(false);
  const launchRelease = useRef<ReturnType<typeof setTimeout>>();
  const {
    phase: launchPhase,
    gameStarted,
    ended: launchEnded,
  } = useLaunchPhase(shop, objectId, launching);
  const sessionEnd = useSessionEnd(
    game?.id,
    game ? getDisplayedPlayTimeInMilliseconds(game) : 0,
    isGameRunning
  );
  const sessionLength = sessionEnd.deltaMs
    ? formatSessionLength(sessionEnd.deltaMs, t)
    : null;
  const launchGeneration = useRef(0);
  const invalidateLaunch = useCallback(() => {
    launchGeneration.current++;
  }, []);
  useEffect(() => {
    const invalidate = () => {
      invalidateLaunch();
      setLocalSaveRetry(null);
      setEpicSaveConflict(null);
    };
    invalidate();
    const stop = window.electron?.onEpicConnectionChanged?.(invalidate);
    return () => {
      invalidateLaunch();
      stop?.();
    };
  }, [shop, objectId, invalidateLaunch]);

  useEffect(() => {
    const onOpenDiscSelection = (event: Event) => {
      const detail = (event as CustomEvent<{ objectId?: string }>).detail;
      if (!detail?.objectId || detail.objectId === game?.objectId) {
        if (game?.shop === "launchbox" && (game?.discs?.length ?? 0) > 1) {
          setShowDiscSelectionModal(true);
        }
      }
    };
    window.addEventListener(
      "hydra:openDiscSelection",
      onOpenDiscSelection as EventListener
    );
    return () => {
      window.removeEventListener(
        "hydra:openDiscSelection",
        onOpenDiscSelection as EventListener
      );
    };
  }, [game?.objectId, game?.shop, game?.discs?.length]);

  useEffect(() => {
    const onFavoriteToggled = () => {
      updateLibrary();
      updateGame();
    };

    const onGameRemoved = () => {
      updateLibrary();
      updateGame();
    };

    const onFilesRemoved = () => {
      updateLibrary();
      updateGame();
    };

    window.addEventListener(
      "hydra:game-favorite-toggled",
      onFavoriteToggled as EventListener
    );
    window.addEventListener(
      "hydra:game-removed-from-library",
      onGameRemoved as EventListener
    );
    window.addEventListener(
      "hydra:game-files-removed",
      onFilesRemoved as EventListener
    );

    return () => {
      window.removeEventListener(
        "hydra:game-favorite-toggled",
        onFavoriteToggled as EventListener
      );
      window.removeEventListener(
        "hydra:game-removed-from-library",
        onGameRemoved as EventListener
      );
      window.removeEventListener(
        "hydra:game-files-removed",
        onFilesRemoved as EventListener
      );
    };
  }, [updateLibrary, updateGame]);

  const addGameToLibrary = async () => {
    setToggleLibraryGameDisabled(true);

    try {
      await window.electron.addGameToLibrary(
        shop,
        objectId!,
        gameTitle,
        shopDetails?.platform ?? null
      );

      updateLibrary();
      updateGame();
    } finally {
      setToggleLibraryGameDisabled(false);
    }
  };

  const toggleWishlistForGameOutsideLibrary = async () => {
    setToggleLibraryGameDisabled(true);

    try {
      await window.electron.setGameWishlisted(
        shop,
        objectId!,
        !isWishlistOnlyGame,
        gameTitle,
        shopDetails?.platform ?? null
      );
      showSuccessToast(
        t(isWishlistOnlyGame ? "removed_from_wishlist" : "added_to_wishlist", {
          ns: "library",
        })
      );
    } catch {
      showErrorToast(t("failed_update_wishlist", { ns: "library" }));
    } finally {
      updateLibrary();
      updateGame();
      setToggleLibraryGameDisabled(false);
    }
  };

  const launchClassicsWithErrorHandling = async (
    discPath?: string,
    force?: boolean
  ): Promise<void> => {
    if (!game) return;
    try {
      await window.electron.openClassicsGame(
        game.shop,
        game.objectId,
        discPath,
        force
      );
    } catch (error) {
      handleClassicsLaunchError(error, {
        t,
        showErrorToast,
        showSuccessToast,
        navigate,
        onEmulatorAlreadyRunning: () => setPendingClassicsLaunch({ discPath }),
      });
    }
  };

  const openClassicsGame = async () => {
    if (!game) return;

    const discs = game.discs ?? [];

    if (
      discs.length === 0 ||
      (discs.length === 1 && game.selectedDiscPath !== null)
    ) {
      await launchClassicsWithErrorHandling();
      return;
    }

    if (game.dontAskDiscSelection && game.selectedDiscPath) {
      await launchClassicsWithErrorHandling(game.selectedDiscPath);
      return;
    }

    setShowDiscSelectionModal(true);
  };

  const handleDiscSelectionConfirm = async (
    discPath: string,
    dontAskAgain: boolean
  ) => {
    if (!game) return;
    setShowDiscSelectionModal(false);
    try {
      await window.electron.updateClassicsDisc(game.shop, game.objectId, {
        selectedDiscPath: discPath,
        dontAskDiscSelection: dontAskAgain,
      });
      updateGame();
    } catch (error) {
      // non-fatal; still try to launch
    }
    await launchClassicsWithErrorHandling(discPath);
  };

  useEffect(() => {
    if (isGameRunning || launchEnded) setLaunching(false);
  }, [isGameRunning, launchEnded]);

  useEffect(() => () => clearTimeout(launchRelease.current), []);

  // The button keeps its launching look until the game shows up as running;
  // the grace period covers a launch that returns without a detected process.
  const runLaunch = async (launch: () => Promise<unknown>) => {
    clearTimeout(launchRelease.current);
    setLaunching(true);
    try {
      await launch();
    } finally {
      launchRelease.current = setTimeout(() => setLaunching(false), 8000);
    }
  };

  const openGame = async () => {
    if (!game) return;

    if (game.shop === "launchbox") {
      await openClassicsGame();
      return;
    }

    if (game.executablePath) {
      await runLaunch(() => launchMember(game));
      return;
    }

    const gameExecutablePath = await selectGameExecutable();
    if (gameExecutablePath)
      window.electron.openGame(
        game.shop,
        game.objectId,
        gameExecutablePath,
        game.launchOptions
      );
  };
  const launchMember = async (
    member: LibraryGame,
    localOnce = false,
    offline = false,
    skipUpdateCheck = false
  ) => {
    if (!member.executablePath) return;
    setLocalSaveRetry(null);
    setEpicSaveConflict(null);
    setCanRetryOffline(false);
    setCanRetryLocalSaves(false);
    const generation = launchGeneration.current;
    try {
      await window.electron.openGame(
        member.shop,
        member.objectId,
        member.executablePath,
        member.launchOptions,
        getEpicLaunchOptions(localOnce, offline, skipUpdateCheck)
      );
    } catch (error) {
      clearTimeout(launchRelease.current);
      setLaunching(false);
      if (generation !== launchGeneration.current) return;
      const code =
        member.shop === "epic" ? getEpicLaunchError(error) : undefined;
      if (code === "save-conflict") {
        setEpicSaveConflict(member);
        return;
      }
      if (code === "update-required") void epicUpdate.refresh(true);
      const translation = code ? getEpicManagedError(code) : null;
      showErrorToast(
        translation
          ? t(translation.key, { ns: translation.ns })
          : t("epic_launch_failed")
      );
      if (
        member.shop === "epic" &&
        typeof window.electron.getEpicCloudSaveState === "function"
      ) {
        const state = await window.electron
          .getEpicCloudSaveState(member.objectId)
          .catch(() => null);
        if (generation !== launchGeneration.current) return;
        if (state?.status === "conflict") {
          setEpicSaveConflict(member);
          return;
        }
        if (
          canRetryEpicLaunchWithLocalSaves(state) ||
          state?.canRunOffline === true
        ) {
          setLocalSaveRetry({ member, skipUpdateCheck });
          setCanRetryOffline(state?.canRunOffline === true);
          setCanRetryLocalSaves(canRetryEpicLaunchWithLocalSaves(state));
        }
      }
    }
  };

  const startEpicUpdate = async (resume = false) => {
    const result = await epicUpdate.start(lastPacket !== null, resume);
    if (result.ok) {
      await Promise.all([updateLibrary(), updateGame()]);
      return;
    }
    const translation = getEpicManagedError(result.error);
    showErrorToast(
      t("epic_update_failed"),
      t(translation.key, { ns: translation.ns })
    );
  };

  const resumeEpicUpdate = async () => {
    if (!game) return;
    if (epicDownload?.status !== "paused" && epicDownload?.status !== "error") {
      await startEpicUpdate(true);
      return;
    }
    try {
      const resumed = await resumeDownload(
        game.shop,
        game.objectId,
        "queueIfActive"
      );
      if (resumed === false) showErrorToast(t("epic_update_failed"));
    } catch {
      showErrorToast(t("epic_update_failed"));
      await updateLibrary();
    }
    await updateGame();
  };

  const closeGame = () => {
    if (game) window.electron.closeGame(game.shop, game.objectId);
  };

  const deleting = game ? isGameDeleting(game?.id) : false;

  const addGameToLibraryButton = (
    <Button
      theme="outline"
      disabled={toggleLibraryGameDisabled}
      onClick={addGameToLibrary}
      className="hero-panel-actions__action"
    >
      <PlusCircleIcon />
      {t("add_to_library")}
    </Button>
  );

  const addToWishlistButton = (
    <Button
      theme="outline"
      disabled={toggleLibraryGameDisabled}
      onClick={toggleWishlistForGameOutsideLibrary}
      className="hero-panel-actions__action"
      title={t("empty_wishlist_description", { ns: "library" })}
    >
      {isWishlistOnlyGame ? <StarFillIcon /> : <StarIcon />}
      {t(
        isWishlistOnlyGame ? "remove_from_wishlist_action" : "add_to_wishlist",
        {
          ns: "library",
        }
      )}
    </Button>
  );

  const showDownloadOptionsButton = (
    <Button
      onClick={() => setShowRepacksModal(true)}
      theme="outline"
      disabled={deleting}
      className="hero-panel-actions__action"
    >
      {t("open_download_options")}
    </Button>
  );

  const finishedDownloadButton = () => {
    if (
      !downloadGame ||
      !finishedDownloadStep ||
      finishedDownloadStep === "play"
    ) {
      return null;
    }

    if (finishedDownloadStep === "checking") {
      return (
        <Button theme="outline" disabled className="hero-panel-actions__action">
          {t("checking_files", { ns: "downloads" })}
        </Button>
      );
    }

    if (finishedDownloadStep === "extracting") {
      return (
        <Button theme="outline" disabled className="hero-panel-actions__action">
          {t("extracting")}
        </Button>
      );
    }

    if (finishedDownloadStep === "extract") {
      return (
        <Button
          onClick={async () => {
            await window.electron
              .extractGameDownload(downloadGame.shop, downloadGame.objectId)
              .catch((error) =>
                logger.error("Failed to start extraction", error)
              );
            updateLibrary();
          }}
          theme="outline"
          disabled={deleting}
          className="hero-panel-actions__action"
        >
          <FileArchive size={16} />
          {t("extract", { ns: "downloads" })}
        </Button>
      );
    }

    if (finishedDownloadStep === "installing") {
      return (
        <Button theme="outline" disabled className="hero-panel-actions__action">
          {t("installing", { ns: "downloads" })}
        </Button>
      );
    }

    if (finishedDownloadStep === "install") {
      return (
        <Button
          onClick={async () => {
            const opened = await window.electron
              .openGameInstaller(downloadGame.shop, downloadGame.objectId)
              .catch((error) => {
                logger.error("Failed to open game installer", error);
                return false;
              });

            if (!opened) {
              showErrorToast(t("installer_launch_failed", { ns: "downloads" }));
            }

            updateLibrary();
          }}
          theme="outline"
          disabled={deleting}
          className="hero-panel-actions__action"
        >
          <DownloadIcon />
          {t("install")}
        </Button>
      );
    }

    return (
      <Button
        onClick={async () => {
          const picked = await pickGameExecutable(
            downloadGame.shop,
            downloadGame.objectId
          );

          if (picked) updateGame();
        }}
        theme="outline"
        disabled={deleting}
        className="hero-panel-actions__action"
      >
        <FileIcon size={16} />
        {t("select_executable", { ns: "downloads" })}
      </Button>
    );
  };

  const gameActionButton = () => {
    if (isTransferring) {
      const percent = Math.round(transferProgress * 100);
      return (
        <Button
          theme="outline"
          className="hero-panel-actions__action"
          onClick={() => {
            setGameOptionsInitialCategory("locations");
            setShowGameOptionsModal(true);
          }}
        >
          Transferring {percent}%
        </Button>
      );
    }

    if (isGameRunning) {
      return (
        <Button
          onClick={closeGame}
          theme="outline"
          disabled={deleting}
          className="hero-panel-actions__action"
        >
          <XCircle size={18} />
          {t("close")}
        </Button>
      );
    }

    const isPlayableClassics =
      game?.shop === "launchbox" && (game?.discs?.length ?? 0) > 0;

    if (game?.executablePath && epicDownload?.epic?.update) {
      if (
        isLibraryGameDownloading({ download: epicDownload }) ||
        epicDownload.queued
      )
        return (
          <Button
            theme="outline"
            disabled
            className="hero-panel-actions__action"
          >
            <DownloadIcon />
            {t("epic_updating")}
          </Button>
        );
      if (epicUpdateInterrupted)
        return (
          <Button
            onClick={resumeEpicUpdate}
            theme="outline"
            disabled={deleting || epicUpdate.starting}
            className="hero-panel-actions__action"
          >
            <DownloadIcon />
            {t("epic_update_resume")}
          </Button>
        );
    }

    if (
      game?.executablePath &&
      epicUpdate.update &&
      !isLibraryGameDownloading({ download: epicDownload })
    ) {
      return (
        <>
          <Button
            onClick={() => void startEpicUpdate()}
            theme="outline"
            disabled={deleting || epicUpdate.starting}
            className="hero-panel-actions__action"
            title={t("epic_update_available", {
              version: epicUpdate.update.publishedVersion,
            })}
          >
            <DownloadIcon />
            {t("epic_update")}
          </Button>
          <Button
            onClick={() => {
              if (game) void launchMember(game, false, false, true);
            }}
            theme="outline"
            disabled={deleting || epicUpdate.starting}
            className="hero-panel-actions__action"
          >
            <PlayIcon />
            {t("epic_play_without_update")}
          </Button>
        </>
      );
    }

    if (game?.executablePath && game.executableStatus) {
      return (
        <Button
          onClick={async () => {
            const status = await window.electron.checkGameExecutable(
              game.shop,
              game.objectId
            );
            await updateGame();
            if (!status) return;
            setGameOptionsInitialCategory("locations");
            setShowGameOptionsModal(true);
          }}
          theme="outline"
          disabled={deleting}
          className="hero-panel-actions__action"
          title={`${t(`executable_status_${game.executableStatus}`)} ${game.executablePath}`}
        >
          <AlertIcon />
          {t(`executable_status_${game.executableStatus}_short`)}
        </Button>
      );
    }

    if (launching) {
      return (
        <Button
          theme="outline"
          disabled
          aria-live="polite"
          className="hero-panel-actions__action hero-panel-actions__action--launching"
        >
          {gameStarted ? (
            <CheckIcon className="hero-panel-actions__launch-check" />
          ) : (
            <span className="hero-panel-actions__launch-spinner" />
          )}
          <span key={gameStarted ? "started" : launchPhase}>
            {tLauncher(gameStarted ? "game_started" : `phase_${launchPhase}`)}
          </span>
        </Button>
      );
    }

    if (game?.executablePath || isPlayableClassics) {
      const playButton = (
        <Button
          onClick={openGame}
          theme="outline"
          disabled={deleting || isGameRunning}
          className={cn("hero-panel-actions__action", {
            "hero-panel-actions__action--returned": sessionEnd.justEnded,
          })}
        >
          <PlayIcon />
          {t("play")}
        </Button>
      );

      if (!sessionEnd.justEnded) return playButton;

      return (
        <div className="hero-panel-actions__play">
          {playButton}
          {sessionLength && (
            <span className="hero-panel-actions__session-chip">
              <CheckIcon size={12} />
              {t("session_added", { amount: sessionLength })}
            </span>
          )}
        </div>
      );
    }

    const finishedDownloadAction = finishedDownloadButton();
    if (finishedDownloadAction) return finishedDownloadAction;

    return (
      <Button
        onClick={() => setShowRepacksModal(true)}
        theme="outline"
        disabled={isGameDownloading}
        className={`hero-panel-actions__action ${repacks.length === 0 && !canDownloadOnSteam(officialMembers.steam) && !officialMembers.epic ? "hero-panel-actions__action--disabled" : ""}`}
      >
        <DownloadIcon />
        {t("download")}
      </Button>
    );
  };

  if (repacks.length && !isInLibrary) {
    return (
      <>
        {addGameToLibraryButton}
        {addToWishlistButton}
        {showDownloadOptionsButton}
      </>
    );
  }

  if (game && isInLibrary) {
    const availableUpdate = (presentation?.members ?? [game]).find(
      (member) => member.availableUpdate
    )?.availableUpdate;

    return (
      <div className="hero-panel-actions__container">
        <EpicCloudSaveConflictModal
          game={epicSaveConflict}
          isGameRunning={isGameRunning}
          onClose={() => setEpicSaveConflict(null)}
        />
        <Modal
          visible={!!localSaveRetry}
          title={
            canRetryLocalSaves
              ? t("epic_play_local_saves")
              : t("epic_play_offline_title")
          }
          description={
            canRetryLocalSaves
              ? t("epic_play_local_saves_description")
              : t("epic_play_offline_description")
          }
          onClose={() => setLocalSaveRetry(null)}
        >
          <div className="hero-panel-actions__epic-actions">
            {canRetryLocalSaves && (
              <Button
                onClick={() => {
                  if (localSaveRetry)
                    void launchMember(
                      localSaveRetry.member,
                      true,
                      false,
                      localSaveRetry.skipUpdateCheck
                    );
                }}
              >
                {t("epic_play_local_saves")}
              </Button>
            )}
            {canRetryOffline && (
              <Button
                theme="outline"
                onClick={() => {
                  if (localSaveRetry)
                    void launchMember(localSaveRetry.member, false, true);
                }}
              >
                {t("epic_play_offline")}
              </Button>
            )}
          </div>
        </Modal>
        {availableUpdate && (
          <Button
            theme="outline"
            className="hero-panel-actions__action hero-panel-actions__update"
            title={availableUpdate.release.title}
            onClick={() =>
              navigate(
                buildGameDetailsPath(presentation ?? game, { update: "1" })
              )
            }
          >
            <SyncIcon size={14} />
            {t("update_to_version", {
              version:
                formatReleaseVersion(
                  parseReleaseVersion(availableUpdate.release.title)
                ) ?? availableUpdate.release.title,
            })}
          </Button>
        )}
        {gameActionButton()}
        <div className="hero-panel-actions__separator" />
        <Button
          onClick={() => {
            setGameOptionsInitialCategory("general");
            setShowGameOptionsModal(true);
          }}
          theme="outline"
          disabled={deleting}
          className="hero-panel-actions__action"
        >
          <GearIcon />
          {t("options")}
        </Button>

        {game.shop === "launchbox" && (
          <DiscSelectionModal
            visible={showDiscSelectionModal}
            discs={game.discs ?? []}
            defaultDiscPath={game.selectedDiscPath ?? null}
            defaultDontAsk={Boolean(game.dontAskDiscSelection)}
            onClose={() => setShowDiscSelectionModal(false)}
            onConfirm={handleDiscSelectionConfirm}
          />
        )}

        <ConfirmationModal
          visible={pendingClassicsLaunch !== null}
          title={t("rpcs3_already_running_title")}
          descriptionText={t("rpcs3_already_running_description")}
          confirmButtonLabel={t("rpcs3_already_running_confirm")}
          cancelButtonLabel={t("cancel")}
          onClose={() => setPendingClassicsLaunch(null)}
          onConfirm={() => {
            const pending = pendingClassicsLaunch;
            setPendingClassicsLaunch(null);
            if (pending) {
              void launchClassicsWithErrorHandling(pending.discPath, true);
            }
          }}
        />
      </div>
    );
  }

  return (
    <>
      {addGameToLibraryButton}
      {addToWishlistButton}
    </>
  );
}
