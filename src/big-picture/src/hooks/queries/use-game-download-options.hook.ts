import { useEffect, useState } from "react";
import { IS_DESKTOP } from "../../constants";
import type { DownloadSource, Game, GameRepack } from "@types";
import {
  applyHosterAvailability,
  fetchHosterAvailability,
  filterDownloadableRepacks,
  mergeLocalRepacks,
} from "@shared";
import { orderBy } from "lodash-es";

export type DownloadOptionsEmptyStateReason =
  | "no-configured-sources"
  | "no-game-sources"
  | "no-download-options";

function getKnownGameSourcesEmptyStateReason(
  downloadSources: string[] | undefined
): DownloadOptionsEmptyStateReason | null {
  if (Array.isArray(downloadSources) && downloadSources.length === 0) {
    return "no-game-sources";
  }

  return null;
}

interface DownloadStateSetters {
  setDownloadOptions: (v: GameRepack[]) => void;
  setLocalDownloadSources: (v: DownloadSource[]) => void;
  setIsCheckingSources: (v: boolean) => void;
  setIsLoading: (v: boolean) => void;
  setEmptyStateReason: (v: DownloadOptionsEmptyStateReason | null) => void;
}

function applyIfNotCancelled(
  signal: { cancelled: boolean },
  apply: () => void
) {
  if (!signal.cancelled) {
    apply();
  }
}

function resetDownloadOptionsState(
  signal: { cancelled: boolean },
  setters: DownloadStateSetters
) {
  applyIfNotCancelled(signal, () => {
    setters.setDownloadOptions([]);
    setters.setLocalDownloadSources([]);
    setters.setIsCheckingSources(true);
    setters.setIsLoading(false);
    setters.setEmptyStateReason(null);
  });
}

function setNoConfiguredSourcesState(
  signal: { cancelled: boolean },
  setters: DownloadStateSetters
) {
  applyIfNotCancelled(signal, () => {
    setters.setLocalDownloadSources([]);
    setters.setDownloadOptions([]);
    setters.setIsCheckingSources(false);
    setters.setIsLoading(false);
    setters.setEmptyStateReason("no-configured-sources");
  });
}

function setKnownEmptyState(
  signal: { cancelled: boolean },
  setters: DownloadStateSetters,
  reason: DownloadOptionsEmptyStateReason
) {
  applyIfNotCancelled(signal, () => {
    setters.setDownloadOptions([]);
    setters.setIsCheckingSources(false);
    setters.setIsLoading(false);
    setters.setEmptyStateReason(reason);
  });
}

function startRemoteDownloadOptionsLoading(
  signal: { cancelled: boolean },
  setters: DownloadStateSetters
) {
  applyIfNotCancelled(signal, () => {
    setters.setIsCheckingSources(false);
    setters.setIsLoading(true);
  });
}

function setDownloadOptionsSuccessState(
  signal: { cancelled: boolean },
  setters: DownloadStateSetters,
  options: GameRepack[]
) {
  applyIfNotCancelled(signal, () => {
    setters.setDownloadOptions(options);
    setters.setEmptyStateReason(
      options.length === 0 ? "no-download-options" : null
    );
    setters.setIsCheckingSources(false);
    setters.setIsLoading(false);
  });
}

function setNoDownloadOptionsState(
  signal: { cancelled: boolean },
  setters: DownloadStateSetters
) {
  applyIfNotCancelled(signal, () => {
    setters.setDownloadOptions([]);
    setters.setEmptyStateReason("no-download-options");
    setters.setIsCheckingSources(false);
    setters.setIsLoading(false);
  });
}

const fetchLocalRepacks = (title: string | undefined) =>
  title
    ? globalThis.window.electron
        .getLocalSourceRepacks(title)
        .catch(() => [] as GameRepack[])
    : Promise.resolve([] as GameRepack[]);

async function fetchDownloadOptions(
  game: Pick<Game, "objectId" | "shop"> & { title?: string },
  signal: { cancelled: boolean },
  setters: DownloadStateSetters,
  knownGameSourcesEmptyStateReason: DownloadOptionsEmptyStateReason | null
) {
  resetDownloadOptionsState(signal, setters);

  let sortedSources: DownloadSource[] = [];

  try {
    const sources = (await globalThis.window.electron.leveldb.values(
      "downloadSources"
    )) as DownloadSource[];
    sortedSources = orderBy(sources, "createdAt", "desc");

    applyIfNotCancelled(signal, () => {
      setters.setLocalDownloadSources(sortedSources);
    });
  } catch {
    setNoConfiguredSourcesState(signal, setters);
    return;
  }

  if (sortedSources.length === 0) {
    setNoConfiguredSourcesState(signal, setters);
    return;
  }

  startRemoteDownloadOptionsLoading(signal, setters);

  try {
    const endpoint = `/games/${game.shop}/${game.objectId}/download-sources`;

    // The server already knows it has nothing; Hydra's own copy of the
    // sources may still match the game.
    const [response, localRepacks] = await Promise.all([
      knownGameSourcesEmptyStateReason === null
        ? globalThis.window.electron.hydraApi.get<GameRepack[]>(endpoint, {
            params: {
              take: 100,
              skip: 0,
              downloadSourceIds: sortedSources.map((source) => source.id),
            },
            needsAuth: false,
          })
        : Promise.resolve([] as GameRepack[]),
      fetchLocalRepacks(game.title),
    ]);
    const options = filterDownloadableRepacks(
      mergeLocalRepacks(Array.isArray(response) ? response : [], localRepacks)
    );

    if (options.length === 0 && knownGameSourcesEmptyStateReason !== null) {
      setKnownEmptyState(signal, setters, knownGameSourcesEmptyStateReason);
      return;
    }

    setDownloadOptionsSuccessState(signal, setters, options);

    if (signal.cancelled || options.length === 0) {
      return;
    }

    const results = await fetchHosterAvailability(options, (url, data) =>
      globalThis.window.electron.hydraApi.post(url, { data, needsAuth: false })
    );

    if (results.length === 0) return;

    applyIfNotCancelled(signal, () => {
      setters.setDownloadOptions(applyHosterAvailability(options, results));
    });
  } catch {
    setNoDownloadOptionsState(signal, setters);
  }
}

export function useGameDownloadOptions(
  game: Pick<Game, "objectId" | "shop"> & {
    title?: string;
    downloadSources?: string[];
  },
  visible: boolean
) {
  const shouldLoadDownloadOptions =
    visible && IS_DESKTOP && game.shop !== "custom";
  const knownGameSourcesEmptyStateReason = getKnownGameSourcesEmptyStateReason(
    game.downloadSources
  );
  const downloadSourcesDependencyKey = Array.isArray(game.downloadSources)
    ? game.downloadSources.join("|")
    : "__unknown__";
  const [downloadOptions, setDownloadOptions] = useState<GameRepack[]>([]);
  const [localDownloadSources, setLocalDownloadSources] = useState<
    DownloadSource[]
  >([]);
  // Local source matching needs a title; without one an empty server answer is final.
  const knownEmptyState = game.title ? null : knownGameSourcesEmptyStateReason;
  const [isCheckingSources, setIsCheckingSources] = useState(
    shouldLoadDownloadOptions && knownEmptyState === null
  );
  const [isLoading, setIsLoading] = useState(
    shouldLoadDownloadOptions && knownEmptyState === null
  );
  const [emptyStateReason, setEmptyStateReason] =
    useState<DownloadOptionsEmptyStateReason | null>(
      shouldLoadDownloadOptions ? knownEmptyState : null
    );

  useEffect(() => {
    if (!shouldLoadDownloadOptions) {
      setDownloadOptions([]);
      setLocalDownloadSources([]);
      setIsCheckingSources(false);
      setIsLoading(false);
      setEmptyStateReason(null);
      return;
    }

    if (knownEmptyState !== null) {
      setDownloadOptions([]);
      setLocalDownloadSources([]);
      setIsCheckingSources(false);
      setIsLoading(false);
      setEmptyStateReason(knownEmptyState);
      return;
    }

    const signal = { cancelled: false };

    void fetchDownloadOptions(
      game,
      signal,
      {
        setDownloadOptions,
        setLocalDownloadSources,
        setIsCheckingSources,
        setIsLoading,
        setEmptyStateReason,
      },
      knownGameSourcesEmptyStateReason
    );

    return () => {
      signal.cancelled = true;
    };
  }, [
    downloadSourcesDependencyKey,
    game.objectId,
    game.shop,
    game.title,
    knownEmptyState,
    knownGameSourcesEmptyStateReason,
    shouldLoadDownloadOptions,
  ]);

  return {
    downloadOptions,
    localDownloadSources,
    isCheckingSources,
    isLoading,
    emptyStateReason,
  };
}
