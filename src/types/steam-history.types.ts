export interface SteamHistoryAchievement {
  apiName: string;
  displayName: string | null;
  description: string | null;
  /** Unix seconds; null while locked. */
  unlockTime: number | null;
}

/** What Steam reports for one game, kept apart from Hydra's own tracking. */
export interface SteamGameHistory {
  appId: string;
  name: string;
  playtimeMinutes: number;
  playtimeLinuxMinutes: number;
  playtimeDeckMinutes: number;
  /** Unix seconds; null when Steam has no record. */
  lastPlayedAt: number | null;
  achievements: SteamHistoryAchievement[] | null;
  /** Epoch milliseconds of the sync that wrote this entry. */
  syncedAt: number;
}

export interface SteamHistorySyncStatus {
  running: boolean;
  total: number;
  processed: number;
  /** Days of play recorded into the activity heatmap by this run. */
  activityDays: number;
  gamesWithAchievements: number;
  /** Library games created by this run. */
  gamesAdded: number;
  error: string | null;
  finishedAt: number | null;
}
