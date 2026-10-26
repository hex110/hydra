import type { PlayStatus } from "../types/library-metadata.types";

export type CompletionSuggestionReason = "achievements" | "story";

interface CompletionSuggestionInput {
  playStatus?: PlayStatus | null;
  dismissed?: boolean;
  playTimeInMilliseconds: number;
  unlockedAchievements: number;
  totalAchievements: number;
  /** How Long to Beat's main story length, in hours. */
  mainStoryHours?: number | null;
}

const HOUR_MS = 3_600_000;

/**
 * When to offer marking a game Finished: every achievement unlocked, or the
 * main story's length played. Finished and dropped games are never offered,
 * and neither is a game the user said no to.
 */
export const getCompletionSuggestion = ({
  playStatus,
  dismissed,
  playTimeInMilliseconds,
  unlockedAchievements,
  totalAchievements,
  mainStoryHours,
}: CompletionSuggestionInput): CompletionSuggestionReason | null => {
  if (dismissed || playStatus === "finished" || playStatus === "dropped") {
    return null;
  }

  if (totalAchievements > 0 && unlockedAchievements >= totalAchievements) {
    return "achievements";
  }

  if (
    mainStoryHours &&
    mainStoryHours >= 1 &&
    playTimeInMilliseconds >= mainStoryHours * HOUR_MS
  ) {
    return "story";
  }

  return null;
};
