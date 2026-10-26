import type { SteamGameHistory, SteamHistoryAchievement } from "@types";

export interface SteamOwnedGame {
  appid: number;
  name?: string;
  playtime_forever?: number;
  playtime_linux_forever?: number;
  playtime_deck_forever?: number;
  rtime_last_played?: number;
  has_community_visible_stats?: boolean;
  img_icon_url?: string;
}

export interface SteamPlayerAchievement {
  apiname: string;
  achieved: number;
  unlocktime: number;
}

export interface SteamSchemaAchievement {
  name: string;
  displayName?: string;
  description?: string;
}

const MINUTE_MS = 60_000;

export const toHistoryEntry = (
  game: SteamOwnedGame,
  previous: SteamGameHistory | null,
  now: number
): SteamGameHistory => ({
  appId: String(game.appid),
  name: game.name ?? previous?.name ?? String(game.appid),
  playtimeMinutes: game.playtime_forever ?? 0,
  playtimeLinuxMinutes: game.playtime_linux_forever ?? 0,
  playtimeDeckMinutes: game.playtime_deck_forever ?? 0,
  lastPlayedAt: game.rtime_last_played || null,
  achievements: previous?.achievements ?? null,
  syncedAt: now,
});

/** Achievements are re-read only when the game was played since the last sync. */
export const needsAchievementFetch = (
  game: SteamOwnedGame,
  previous: SteamGameHistory | null
) => {
  if (!game.has_community_visible_stats || !(game.playtime_forever ?? 0)) {
    return false;
  }
  if (!previous?.achievements) return true;

  return (
    previous.playtimeMinutes !== game.playtime_forever ||
    (previous.lastPlayedAt ?? 0) !== (game.rtime_last_played ?? 0)
  );
};

export const mergeAchievements = (
  player: SteamPlayerAchievement[],
  schema: SteamSchemaAchievement[]
): SteamHistoryAchievement[] => {
  const names = new Map(schema.map((item) => [item.name, item]));

  return player.map((item) => ({
    apiName: item.apiname,
    displayName: names.get(item.apiname)?.displayName ?? null,
    description: names.get(item.apiname)?.description ?? null,
    unlockTime: item.achieved === 1 && item.unlocktime ? item.unlocktime : null,
  }));
};

/**
 * Play Steam counted since the last sync that Hydra did not already record.
 * Steam has no per-day history, so the whole amount is dated to the last day
 * the game was played. The first sync has no baseline and records nothing.
 */
export const steamActivityToRecord = ({
  previous,
  current,
  hydraMsSincePrevious,
}: {
  previous: SteamGameHistory | null;
  current: SteamGameHistory;
  hydraMsSincePrevious: number;
}): { milliseconds: number; at: Date } | null => {
  if (!previous) return null;

  const steamMs =
    (current.playtimeMinutes - previous.playtimeMinutes) * MINUTE_MS;
  const milliseconds = steamMs - hydraMsSincePrevious;
  if (!(milliseconds > 0)) return null;

  // A last-played time from before the previous sync would date play to the past.
  const lastPlayedMs = (current.lastPlayedAt ?? 0) * 1000;
  const at = new Date(
    lastPlayedMs >= previous.syncedAt ? lastPlayedMs : current.syncedAt
  );

  return { milliseconds, at };
};

/** Steam's total as the part Hydra has not tracked itself, so none is counted twice. */
export const steamPlayTimeToStore = (
  steamMinutes: number,
  hydraPlayTimeInMilliseconds: number,
  additive = false
) =>
  additive
    ? Math.max(0, steamMinutes * MINUTE_MS)
    : Math.max(0, steamMinutes * MINUTE_MS - hydraPlayTimeInMilliseconds);

export const firstUnlockTime = (history: SteamGameHistory) => {
  const times =
    history.achievements
      ?.map((item) => item.unlockTime)
      .filter((time): time is number => time !== null) ?? [];

  return times.length > 0 ? Math.min(...times) : null;
};

/** Demos and betas are not part of the library; `minMinutes` 0 adds everything else. */
export const shouldAddToLibrary = (
  game: SteamOwnedGame,
  minMinutes: number,
  isSkippedTitle: (name: string) => boolean
) =>
  !isSkippedTitle(game.name ?? "") &&
  (game.playtime_forever ?? 0) >= Math.max(0, minMinutes);

/** Steam's public artwork for an app, so imported games need no catalogue request. */
export const steamArtworkUrls = (appId: string, iconHash?: string) => {
  const base = `https://shared.steamstatic.com/store_item_assets/steam/apps/${appId}`;

  return {
    iconUrl: iconHash
      ? `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/${iconHash}.jpg`
      : null,
    libraryImageUrl: `${base}/library_600x900_2x.jpg`,
    libraryHeroImageUrl: `${base}/library_hero.jpg`,
    logoImageUrl: `${base}/logo.png`,
  };
};

const STEAM_SKIP_TITLE_PATTERN =
  /\b(?:demo|(?:play|public|closed|open|technical)[\s-]*test|test[\s-]*(?:server|client)|beta|ptb)\b/i;

/** Demos, playtests and betas: owned on Steam, but not games for the library. */
export const isSkippedSteamLibraryTitle = (name: string): boolean =>
  STEAM_SKIP_TITLE_PATTERN.test(name.trim());
