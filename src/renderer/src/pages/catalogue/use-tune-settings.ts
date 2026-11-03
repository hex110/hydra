import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_TUNE_OPTIONS,
  DEFAULT_TUNE_SETTINGS,
  type TuneOptions,
  type TunePreset,
  type TunePresetOptions,
  type TuneSettings,
} from "@shared";
import { logger } from "@renderer/logger";

interface Snapshot {
  settings: TuneSettings;
  isLoaded: boolean;
}

let snapshot: Snapshot = { settings: DEFAULT_TUNE_SETTINGS, isLoaded: false };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const publish = (next: Snapshot) => {
  snapshot = next;
  for (const listener of listeners) listener();
};

const load = () => {
  loading ??= window.electron
    .getTuneSettings()
    .then((settings) => publish({ settings, isLoaded: true }))
    .catch((error) => {
      logger.error("Failed to load the Tune settings", error);
      publish({ ...snapshot, isLoaded: true });
    });
  return loading;
};

const save = (settings: TuneSettings) => {
  publish({ settings, isLoaded: true });
  window.electron
    .setTuneSettings(settings)
    .catch((error) => logger.error("Failed to save the Tune settings", error));
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const AVOID_KEYS = ["avoidTags", "avoidRelated", "avoidStrictness"] as const;

const withoutAvoid = (options: TuneOptions): TunePresetOptions => {
  const copy: Partial<TuneOptions> = { ...options };
  for (const key of AVOID_KEYS) delete copy[key];
  return copy as TunePresetOptions;
};

/** The settings of the recommender, shared by every surface that shows suggestions. */
export function useTuneSettings() {
  const { settings, isLoaded } = useSyncExternalStore(
    subscribe,
    () => snapshot
  );

  useEffect(() => {
    void load();
  }, []);

  const setOptions = useCallback((changes: Partial<TuneOptions>) => {
    save({
      ...snapshot.settings,
      options: { ...snapshot.settings.options, ...changes },
    });
  }, []);

  /** Back to the defaults; the avoid list stays, since it is a standing choice. */
  const reset = useCallback(() => {
    const { avoidTags, avoidRelated, avoidStrictness } =
      snapshot.settings.options;
    save({
      ...snapshot.settings,
      options: {
        ...DEFAULT_TUNE_OPTIONS,
        avoidTags,
        avoidRelated,
        avoidStrictness,
      },
    });
  }, []);

  const savePreset = useCallback((name: string) => {
    const preset: TunePreset = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      options: withoutAvoid(snapshot.settings.options),
    };
    save({
      ...snapshot.settings,
      presets: [...snapshot.settings.presets, preset],
    });
  }, []);

  const applyPreset = useCallback((id: string) => {
    const preset = snapshot.settings.presets.find((item) => item.id === id);
    if (!preset) return;
    save({
      ...snapshot.settings,
      options: { ...snapshot.settings.options, ...preset.options },
    });
  }, []);

  const deletePreset = useCallback((id: string) => {
    save({
      ...snapshot.settings,
      presets: snapshot.settings.presets.filter((item) => item.id !== id),
    });
  }, []);

  return {
    settings,
    options: settings.options,
    isLoaded,
    setOptions,
    reset,
    savePreset,
    applyPreset,
    deletePreset,
  };
}
