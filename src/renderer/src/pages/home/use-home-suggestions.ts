import { useMemo } from "react";

import { useNotInterested } from "../catalogue/use-not-interested";
import { useRecommendations } from "../catalogue/use-recommendations";
import { useTuneSettings } from "../catalogue/use-tune-settings";

export const HOME_SUGGESTIONS = 12;

/**
 * The catalogue's suggestions for you, with the Tune settings you chose, minus
 * the games you own or hid. Hydra computes them; this only waits and filters.
 */
export function useHomeSuggestions(ownedKeys: ReadonlySet<string>) {
  const { options, isLoaded } = useTuneSettings();
  const { response, isRefreshing } = useRecommendations(
    isLoaded ? options : null,
    { debounce: false }
  );
  const { keys: hidden } = useNotInterested();

  const suggestions = useMemo(
    () =>
      (response?.results ?? [])
        .filter((game) => {
          const key = `steam:${game.appId}`;
          return !ownedKeys.has(key) && !hidden.has(key);
        })
        .slice(0, HOME_SUGGESTIONS),
    [response, ownedKeys, hidden]
  );

  return {
    suggestions,
    isLoading: !response && isRefreshing,
    hasSeeds: (response?.profile.seedCount ?? 0) > 0,
  };
}
