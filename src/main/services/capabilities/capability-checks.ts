import { gamesSublevel, levelKeys } from "@main/level";
import { logger } from "@main/services/logger";
import { updateGameRecord } from "@main/services/game-record-updater";
import { publishCapabilityCheckFailedNotification } from "@main/services/notifications";
import type { GameCapabilityId, GameRun } from "@types";

type CheckedCapability = "renodx" | "optiscaler";

/** Hydra installed it by itself: the game's next run decides whether it stays. */
export const markCapabilityCheckPending = async (
  gameKey: string,
  id: CheckedCapability
) => {
  await updateGameRecord(gameKey, (game) => ({
    pendingCapabilityChecks: [
      ...new Set([...(game.pendingCapabilityChecks ?? []), id]),
    ],
    capabilityChecks: withoutKey(game.capabilityChecks, id),
  }));
};

/** The user chose a mode, so any pending check or failure no longer applies. */
export const clearCapabilityCheck = async (
  gameKey: string,
  id: GameCapabilityId
) => {
  await updateGameRecord(gameKey, (game) => ({
    pendingCapabilityChecks: (game.pendingCapabilityChecks ?? []).filter(
      (pending) => pending !== id
    ),
    capabilityChecks: withoutKey(game.capabilityChecks, id),
  }));
};

const withoutKey = <T>(
  record: Partial<Record<GameCapabilityId, T>> | undefined,
  id: GameCapabilityId
) => {
  const copy = { ...record };
  delete copy[id];
  return copy;
};

/**
 * Settles the first run after an automatic install. A failed check is kept on
 * the game and notified; a pass clears the pending check; an unclear result
 * waits for the next run.
 */
export const applyFirstRunChecks = async (run: GameRun) => {
  const gameKey = levelKeys.game(run.shop, run.objectId);
  try {
    const game = await gamesSublevel.get(gameKey);
    const pending = game?.pendingCapabilityChecks ?? [];
    if (!game || pending.length === 0 || !run.checks) return;

    const settled = run.checks.filter(
      (check) =>
        pending.includes(check.capability) && check.status !== "unclear"
    );
    if (settled.length === 0) return;

    const failed = settled.filter((check) => check.status === "failed");
    await updateGameRecord(gameKey, (current) => {
      const checks = { ...current.capabilityChecks };
      for (const check of failed)
        checks[check.capability] = {
          runId: run.id,
          at: new Date().toISOString(),
          reason: check.reason,
        };
      return {
        capabilityChecks: checks,
        pendingCapabilityChecks: (current.pendingCapabilityChecks ?? []).filter(
          (id) => !settled.some((check) => check.capability === id)
        ),
      };
    });

    for (const check of failed) {
      await publishCapabilityCheckFailedNotification(
        game,
        check.capability,
        check.reason
      );
    }
  } catch (error) {
    logger.error("Could not settle the first-run check", { gameKey, error });
  }
};
