import type {
  CloudSaveAutomaticSyncEvent,
  CloudSaveAutomaticSyncTrigger,
  CloudSaveSyncProgressStage,
  GameShop,
  SyncGameCloudSaveResult,
} from "@types";
import {
  getCloudSaveEmulatorProvider,
  hasRpcs3CloudSaveDisc,
  isCloudSaveV2Eligible,
} from "@shared";
import {
  cloudSavePendingUploadsSublevel,
  gamesSublevel,
  levelKeys,
  saveSyncStatusSublevel,
} from "@main/level";

import { HydraApi } from "../hydra-api";
import { isGameLaunching, isGameRunning } from "../game-running-state";
import { logger } from "../logger";
import { WindowManager } from "../window-manager";
import { getCloudSaveAutomaticSyncEnabled } from "./automatic-sync-settings";
import { canAccessCloudSaves } from "./cloud-save-access";
import { syncGameCloudSave } from "./sync-game-cloud-save";
import { getCloudSaveGameContext } from "./cloud-save-game-context";
import { getCloudSaveErrorDetails } from "./cloud-save-error-details";
import { isCloudSaveEnvironmentChangedError } from "./environment-guard";
import { isCloudSaveExecutableMissingError } from "./executable-path-guard";
import {
  canUploadCloudSaveAfterLaunch,
  consumeCloudSaveLaunchGuard,
} from "./launch-guard";
import { CloudSaveOperationCoordinator } from "./operation-coordinator";
import {
  classifyAutomaticCloudSaveFailure,
  getPendingDeletionAutomaticSyncOutcome,
  type AutomaticCloudSaveSyncOutcome,
} from "./automatic-sync-outcome";
import { isCloudSaveDeletionPending } from "./pending-deletion";
import {
  beginAutomaticSyncObservation,
  finishAutomaticSyncObservation,
} from "./automatic-sync-observation";

const automaticSyncCoordinator =
  new CloudSaveOperationCoordinator<AutomaticCloudSaveSyncOutcome>();

const PREFIX_NOT_READY_ERRORS = new Set([
  "cloud_save_restore_prefix_unresolved",
  "cloud_save_restore_prefix_invalid",
  "cloud_save_restore_profile_unresolved",
]);

const gameKey = (objectId: string, shop: GameShop) =>
  JSON.stringify([shop, objectId]);

const isPendingDeletionBlockingAutomaticSync = async (
  objectId: string,
  shop: GameShop,
  trigger?: CloudSaveAutomaticSyncTrigger
) =>
  isCloudSaveDeletionPending(objectId, shop).catch((error: unknown) => {
    logger.error("[Cloud Save] Failed to inspect pending deletion", {
      shop,
      objectId,
      trigger,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return true;
  });

export const canRunAutomaticCloudSaveSync = async (
  objectId: string,
  shop: GameShop
) => {
  if (
    !canAccessCloudSaves(
      HydraApi.isLoggedIn(),
      HydraApi.hasActiveSubscription()
    ) ||
    (await isPendingDeletionBlockingAutomaticSync(objectId, shop)) ||
    !(await getCloudSaveAutomaticSyncEnabled(objectId, shop))
  ) {
    return false;
  }

  const game = await gamesSublevel
    .get(levelKeys.game(shop, objectId))
    .catch(() => null);
  if (!game || !isCloudSaveV2Eligible(shop, game.platform)) return false;
  if (shop === "steam" || shop === "epic") return Boolean(game.executablePath);
  if (
    getCloudSaveEmulatorProvider(shop, game.platform) === "rpcs3" &&
    !hasRpcs3CloudSaveDisc(game)
  )
    return false;
  if (getCloudSaveEmulatorProvider(shop, game.platform) === "retroarch") {
    const { getSelectedRetroArchRom } = await import(
      "./retroarch-save-provider"
    );
    if (!(await getSelectedRetroArchRom(game))) return false;
  }
  const context = await getCloudSaveGameContext(objectId, shop).catch(
    () => null
  );
  if (!context?.pathContext.executablePath) return false;
  if (getCloudSaveEmulatorProvider(shop, game.platform) === "rpcs3") {
    const { getRpcs3DiscIdentityStatus } = await import(
      "./rpcs3-game-identity.js"
    );
    return (await getRpcs3DiscIdentityStatus(game)).status === "ready";
  }
  return true;
};

const recordAutomaticSyncStatus = async (
  event: CloudSaveAutomaticSyncEvent
) => {
  if (
    event.status !== "completed" &&
    event.status !== "failed" &&
    event.status !== "conflict"
  ) {
    return;
  }
  const { shop, objectId } = event.gameId;
  const key = levelKeys.game(shop, objectId);
  const previous = await saveSyncStatusSublevel.get(key).catch(() => undefined);
  const at = new Date().toISOString();
  await saveSyncStatusSublevel.put(key, {
    shop,
    objectId,
    at,
    status: event.status,
    lastSuccessAt:
      event.status === "completed" ? at : (previous?.lastSuccessAt ?? null),
    ...(event.status === "failed" && event.errorCode
      ? { errorCode: event.errorCode }
      : {}),
  });
};

const emitAutomaticSyncEvent = (event: CloudSaveAutomaticSyncEvent) => {
  WindowManager.sendToAppWindows("on-cloud-save-automatic-sync", event);
  void recordAutomaticSyncStatus(event).catch((error) =>
    logger.warn("Could not record the save sync status", error)
  );
};

export const runAutomaticCloudSaveSyncDetailed = async (
  objectId: string,
  shop: GameShop,
  trigger: CloudSaveAutomaticSyncTrigger,
  suppliedContext?: Awaited<ReturnType<typeof getCloudSaveGameContext>>,
  expectedRemoteHash?: string | null
): Promise<AutomaticCloudSaveSyncOutcome> => {
  if (
    !canAccessCloudSaves(
      HydraApi.isLoggedIn(),
      HydraApi.hasActiveSubscription()
    )
  ) {
    return { status: "skipped", result: null };
  }

  const pendingDeletionOutcome = getPendingDeletionAutomaticSyncOutcome(
    await isPendingDeletionBlockingAutomaticSync(objectId, shop, trigger)
  );
  if (pendingDeletionOutcome) {
    logger.warn("[Cloud Save] Automatic sync blocked by pending deletion", {
      shop,
      objectId,
      trigger,
    });
    emitAutomaticSyncEvent({
      gameId: { objectId, shop },
      trigger,
      status: "cancelled",
    });
    return pendingDeletionOutcome;
  }

  if (!(await getCloudSaveAutomaticSyncEnabled(objectId, shop))) {
    return { status: "skipped", result: null };
  }

  let gameReadFailed = false;
  const game = await gamesSublevel
    .get(levelKeys.game(shop, objectId))
    .catch((error: unknown) => {
      logger.error("[Cloud Save] Failed to inspect automatic sync game", {
        shop,
        objectId,
        trigger,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      gameReadFailed = true;
      return null;
    });
  if (!game || !isCloudSaveV2Eligible(shop, game.platform)) {
    return {
      status: gameReadFailed
        ? classifyAutomaticCloudSaveFailure(trigger)
        : "skipped",
      result: null,
    };
  }
  if (isGameRunning(objectId, shop)) {
    return { status: "skipped", result: null };
  }
  // A starting game is writing its saves before the process watcher sees it.
  if (
    (trigger === "game-page-open" || trigger === "environment-changed") &&
    isGameLaunching(objectId, shop)
  ) {
    return { status: "skipped", result: null };
  }
  if (
    getCloudSaveEmulatorProvider(shop, game.platform) === "rpcs3" &&
    !hasRpcs3CloudSaveDisc(game)
  ) {
    return { status: "skipped", result: null };
  }

  let contextResolutionFailed = false;
  const context =
    suppliedContext ??
    (await getCloudSaveGameContext(objectId, shop).catch((error: unknown) => {
      logger.error("[Cloud Save] Failed to resolve automatic sync context", {
        shop,
        objectId,
        trigger,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      emitAutomaticSyncEvent({
        gameId: { objectId, shop },
        trigger,
        status: "failed",
      });
      contextResolutionFailed = true;
      return null;
    }));
  if (!context) {
    return {
      status: contextResolutionFailed
        ? classifyAutomaticCloudSaveFailure(trigger)
        : "skipped",
      result: null,
    };
  }
  if (!context.pathContext.executablePath) {
    return { status: "skipped", result: null };
  }
  if (getCloudSaveEmulatorProvider(shop, game.platform) === "retroarch") {
    const { getSelectedRetroArchRom } = await import(
      "./retroarch-save-provider"
    );
    if (!(await getSelectedRetroArchRom(game))) {
      return { status: "skipped", result: null };
    }
  }
  const key = gameKey(objectId, shop);
  const operationKey = JSON.stringify([
    trigger,
    context.environmentId,
    expectedRemoteHash === undefined
      ? ["anchor"]
      : ["expected", expectedRemoteHash],
  ]);

  return automaticSyncCoordinator.run(key, operationKey, async () => {
    const observation =
      trigger === "game-page-open"
        ? beginAutomaticSyncObservation(objectId, shop, trigger)
        : ({ accepted: true, observationKey: null } as const);
    if (!observation.accepted) {
      return { status: "skipped", result: null };
    }

    let latestStage: CloudSaveSyncProgressStage | undefined;
    return syncGameCloudSave(
      objectId,
      shop,
      trigger,
      (progress) => {
        latestStage = progress.stage;
        emitAutomaticSyncEvent({
          gameId: { objectId, shop },
          trigger,
          status: "progress",
          progress,
        });
      },
      context,
      expectedRemoteHash
    )
      .then((result) => {
        const status = result.action === "conflict" ? "conflict" : "completed";
        finishAutomaticSyncObservation(
          objectId,
          shop,
          trigger,
          observation.observationKey,
          "settled"
        );
        logger.info("[Cloud Save] Automatic sync finished", {
          shop,
          objectId,
          trigger,
          action: result.action,
          initialState: result.initialState,
          finalState: result.finalState,
        });
        emitAutomaticSyncEvent({
          gameId: { objectId, shop },
          trigger,
          status,
          result,
        });
        return { status: "completed", result } as const;
      })
      .catch((error: unknown) => {
        const environmentChanged = isCloudSaveEnvironmentChangedError(error);
        const executableMissing = isCloudSaveExecutableMissingError(error);
        const gameRunning =
          error instanceof Error && error.message === "cloud_save_game_running";
        // A prefix that was just chosen exists only after the first launch;
        // the pre-launch sync restores into it then.
        const prefixNotReady =
          trigger !== "pre-launch" &&
          error instanceof Error &&
          PREFIX_NOT_READY_ERRORS.has(error.message);
        if (
          environmentChanged ||
          executableMissing ||
          gameRunning ||
          prefixNotReady
        ) {
          let cancellationReason = "environment_changed";
          if (executableMissing) {
            cancellationReason = "executable_missing";
          } else if (gameRunning) {
            cancellationReason = "game_running";
          } else if (prefixNotReady) {
            cancellationReason = "prefix_not_ready";
          }

          finishAutomaticSyncObservation(
            objectId,
            shop,
            trigger,
            observation.observationKey,
            "failed"
          );
          logger.info("[Cloud Save] Automatic sync cancelled", {
            shop,
            objectId,
            trigger,
            reason: cancellationReason,
          });
          emitAutomaticSyncEvent({
            gameId: { objectId, shop },
            trigger,
            status: "cancelled",
          });
          return { status: "cancelled", result: null } as const;
        }
        const errorDetails = getCloudSaveErrorDetails(error);
        finishAutomaticSyncObservation(
          objectId,
          shop,
          trigger,
          observation.observationKey,
          "failed"
        );
        logger.error("[Cloud Save] Automatic sync failed", {
          shop,
          objectId,
          trigger,
          ...errorDetails,
        });
        emitAutomaticSyncEvent({
          gameId: { objectId, shop },
          trigger,
          status: "failed",
          errorCode:
            typeof errorDetails.errorCode === "string"
              ? errorDetails.errorCode
              : undefined,
        });
        return {
          status: classifyAutomaticCloudSaveFailure(trigger, latestStage),
          result: null,
          errorCode:
            typeof errorDetails.errorCode === "string"
              ? errorDetails.errorCode
              : undefined,
        } as AutomaticCloudSaveSyncOutcome;
      });
  });
};

export const runAutomaticCloudSaveSync = async (
  objectId: string,
  shop: GameShop,
  trigger: CloudSaveAutomaticSyncTrigger,
  suppliedContext?: Awaited<ReturnType<typeof getCloudSaveGameContext>>,
  expectedRemoteHash?: string | null
): Promise<SyncGameCloudSaveResult | null> =>
  (
    await runAutomaticCloudSaveSyncDetailed(
      objectId,
      shop,
      trigger,
      suppliedContext,
      expectedRemoteHash
    )
  ).result;

export const runAutomaticCloudSavePostExit = async (
  objectId: string,
  shop: GameShop
): Promise<SyncGameCloudSaveResult | null> => {
  const guard = consumeCloudSaveLaunchGuard(objectId, shop);
  if (
    !canAccessCloudSaves(
      HydraApi.isLoggedIn(),
      HydraApi.hasActiveSubscription()
    )
  ) {
    return null;
  }
  if (!guard?.uploadAllowed) {
    logger.warn("[Cloud Save] Post-exit upload blocked by launch guard", {
      shop,
      objectId,
      reason: guard ? "pre_launch_not_safe" : "missing_launch_guard",
    });
    return null;
  }

  const context = await getCloudSaveGameContext(objectId, shop).catch(
    (error: unknown) => {
      logger.error("[Cloud Save] Failed to verify post-exit environment", {
        shop,
        objectId,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return null;
    }
  );
  if (
    !context ||
    !canUploadCloudSaveAfterLaunch(guard, context.environmentId)
  ) {
    logger.warn(
      "[Cloud Save] Post-exit upload blocked after environment change",
      {
        shop,
        objectId,
      }
    );
    return null;
  }

  // Kept until the upload finishes, so one cut off by a quit or reboot is
  // retried on the next start.
  const pendingKey = levelKeys.game(shop, objectId);
  await cloudSavePendingUploadsSublevel
    .put(pendingKey, { shop, objectId, since: new Date().toISOString() })
    .catch(() => undefined);
  const result = await runAutomaticCloudSaveSync(
    objectId,
    shop,
    "post-exit",
    context,
    guard.baseRemoteHash
  );
  if (result)
    await cloudSavePendingUploadsSublevel
      .del(pendingKey)
      .catch(() => undefined);
  return result;
};

/**
 * Syncs games whose upload after exit did not finish last time. A full sync,
 * not an upload: the store may have moved on since, and that is a conflict.
 */
export const retryPendingCloudSaveUploads = async () => {
  if (
    !canAccessCloudSaves(
      HydraApi.isLoggedIn(),
      HydraApi.hasActiveSubscription()
    )
  )
    return;

  const pending = await cloudSavePendingUploadsSublevel
    .iterator()
    .all()
    .catch(() => []);
  for (const [key, entry] of pending) {
    const shop = entry.shop as GameShop;
    if (isGameRunning(entry.objectId, shop)) continue;
    logger.info("[Cloud Save] Retrying an unfinished upload after exit", {
      shop,
      objectId: entry.objectId,
      since: entry.since,
    });
    const result = await runAutomaticCloudSaveSync(
      entry.objectId,
      shop,
      "game-page-open"
    ).catch(() => null);
    if (result) await cloudSavePendingUploadsSublevel.del(key).catch(() => {});
  }
};
