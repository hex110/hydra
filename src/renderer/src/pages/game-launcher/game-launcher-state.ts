import type { GameLauncherStatus, GameLauncherStatusPayload } from "@types";

const COMPATIBILITY_LAUNCHER_STATUSES = new Set<GameLauncherStatus>([
  "preparing_compatibility_layer",
  "compatibility_layer_ready",
  "compatibility_layer_failed",
  "game_exited_early",
  "game_started",
  "launch_cancelled",
]);

export const getLauncherStatusGroup = (status: GameLauncherStatus) =>
  COMPATIBILITY_LAUNCHER_STATUSES.has(status)
    ? "compatibility"
    : "achievements";

export const createLauncherStatusReplay = (gameKey: string) => {
  const liveStatusGroups = new Set<string>();

  return {
    acceptLiveStatus: (payload: GameLauncherStatusPayload) => {
      if (payload.gameKey !== gameKey) return false;
      liveStatusGroups.add(getLauncherStatusGroup(payload.status));
      return true;
    },
    selectCachedStatuses: (payloads: GameLauncherStatusPayload[]) =>
      payloads.filter(
        (payload) =>
          payload.gameKey === gameKey &&
          !liveStatusGroups.has(getLauncherStatusGroup(payload.status))
      ),
  };
};

export type CompatibilityLayerStatus = "idle" | "preparing" | "failed";

/** Preparing can still be cancelled; a failed setup only needs closing. */
export const getGameLauncherAction = (
  compatibilityLayerStatus: CompatibilityLayerStatus
) =>
  compatibilityLayerStatus === "preparing"
    ? "cancel"
    : compatibilityLayerStatus === "failed"
      ? "close"
      : null;

export const GAME_LAUNCHER_AUTO_CLOSE_DELAY_MS = 5_000;
export const GAME_STARTED_AUTO_CLOSE_DELAY_MS = 1_600;
export const GAME_LAUNCHER_EXIT_ANIMATION_MS = 400;

export const getGameLauncherAutoCloseDelay = (gameStarted: boolean) =>
  gameStarted
    ? GAME_STARTED_AUTO_CLOSE_DELAY_MS
    : GAME_LAUNCHER_AUTO_CLOSE_DELAY_MS;

export const canGameLauncherAutoClose = ({
  preflightFinished,
  isGeneratingAchievements,
  compatibilityLayerStatus,
}: {
  preflightFinished: boolean;
  isGeneratingAchievements: boolean;
  compatibilityLayerStatus: CompatibilityLayerStatus;
}) =>
  preflightFinished &&
  !isGeneratingAchievements &&
  compatibilityLayerStatus === "idle";

export type LaunchPhase =
  | "dependencies"
  | "compatibility"
  | "achievements"
  | "start";

export const getLaunchPhase = ({
  preflightStatus,
  compatibilityLayerStatus,
  achievementsExportStatus,
}: {
  preflightStatus: string;
  compatibilityLayerStatus: CompatibilityLayerStatus;
  achievementsExportStatus: string;
}): LaunchPhase => {
  if (
    preflightStatus === "checking" ||
    preflightStatus === "downloading" ||
    preflightStatus === "installing"
  ) {
    return "dependencies";
  }

  if (compatibilityLayerStatus !== "idle") return "compatibility";

  if (
    achievementsExportStatus === "generating_achievements" ||
    achievementsExportStatus === "downloading_achievement_icons"
  ) {
    return "achievements";
  }

  return "start";
};

/** Phases seen so far, in order, always ending with "start". */
export const addLaunchPhase = (
  seen: LaunchPhase[],
  phase: LaunchPhase
): LaunchPhase[] => {
  if (seen.includes(phase)) return seen;

  return [...seen.filter((item) => item !== "start"), phase, "start"];
};

/** Lifts a cover's muddy average colour into one that glows on a dark card. */
export const getLauncherRingColor = (hex: string) => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;

  const value = Number.parseInt(match[1], 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
  }

  return `hsl(${Math.round((hue * 60 + 360) % 360)} 75% 60%)`;
};
