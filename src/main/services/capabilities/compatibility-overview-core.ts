import {
  capabilityModeFromOverride,
  getCapabilityOverride,
} from "../../../shared/game-capabilities.js";
import type {
  CompatibilityOverviewRow,
  CompatibilityToolState,
  Game,
  GameCapabilityId,
  GameRun,
} from "@types";

const toolState = (
  game: Game,
  id: "renodx" | "optiscaler",
  installed: boolean
): CompatibilityToolState => {
  const mode = capabilityModeFromOverride(getCapabilityOverride(game, id));
  return {
    mode,
    installed,
    failed: mode === "auto" && !!game.capabilityChecks?.[id],
  };
};

export const buildOverviewRow = (
  game: Game,
  lastRun: GameRun | null,
  options: { isWindows: boolean; isLinux: boolean }
): CompatibilityOverviewRow => {
  const onlineFixMode = capabilityModeFromOverride(
    getCapabilityOverride(game, "online_fix" satisfies GameCapabilityId)
  );
  return {
    shop: game.shop,
    objectId: game.objectId,
    title: game.title,
    iconUrl: game.iconUrl ?? null,
    isWindows: options.isWindows,
    onlineFix:
      options.isWindows && options.isLinux
        ? {
            mode: onlineFixMode,
            active: !!game.onlineFix && !game.onlineFixDisabled,
          }
        : null,
    renodx: options.isWindows ? toolState(game, "renodx", !!game.renoDx) : null,
    optiscaler: options.isWindows
      ? toolState(game, "optiscaler", !!game.optiScaler)
      : null,
    lastRun: lastRun
      ? {
          id: lastRun.id,
          startedAt: lastRun.startedAt,
          outcome: lastRun.outcome,
          failedChecks: (lastRun.checks ?? []).filter(
            (check) => check.status === "failed"
          ).length,
        }
      : null,
    updateAvailable: !!game.availableUpdate,
  };
};
