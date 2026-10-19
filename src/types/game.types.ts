export type GameShop = "steam" | "epic" | "custom" | "launchbox";

export type GameSetupReason =
  | "download-complete"
  | "executable-changed"
  | "library-scan"
  | "update"
  | "manual"
  | "launch";

export type GameSetupStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface GameSetupStepResult {
  status: "done" | "skipped" | "warning";
  /** What happened, as a translation key suffix ("created", "exists", …). */
  code: string;
  params?: Record<string, string | number>;
}

export interface GameSetupLogEntry {
  stepId: string;
  status: "done" | "skipped" | "warning" | "failed";
  code: string | null;
  params?: Record<string, string | number>;
  error?: string;
  reason: GameSetupReason;
  at: string;
  durationMs: number;
}

/** Why setup did not run for a game at all. */
export type GameSetupSkipReason =
  | "no-executable"
  | "other-launcher"
  | "steam-install";

export interface GameSetupLog {
  lastRunAt: string;
  reason: GameSetupReason;
  skipped: GameSetupSkipReason | null;
  /** The latest result of each step, in step order. */
  steps: GameSetupLogEntry[];
}

export interface GameSetupStatusEvent {
  shop: GameShop;
  objectId: string;
  status: GameSetupStatus;
  stepId: string | null;
}

export type ShortcutLocation = "desktop" | "start_menu";

export interface UnlockedAchievement {
  name: string;
  unlockTime: number;
  hardcoreUnlockTime?: number | null;
  imageKey?: string | null;
}

export interface SteamAchievement {
  name: string;
  displayName: string;
  description?: string;
  icon: string;
  icongray: string;
  hidden: boolean;
  points?: number;
  externalSetId?: string;
  externalId?: string;
}

export interface UserAchievement extends SteamAchievement {
  unlocked: boolean;
  unlockTime: number | null;
  hardcoreUnlockTime?: number | null;
  source?: "steam" | "epic" | "retroachievements";
  canonicalAchievementId?: string;
  sourceObjectId?: string;
  sources?: Array<{
    shop: "steam" | "epic";
    objectId: string;
    name: string;
    unlockTime: number;
  }>;
  unlockedOn?: {
    hydra: boolean;
    retroachievements: boolean;
    steam: boolean;
    epic?: boolean;
  };
  imageUrl?: string | null;
}
