import { IDLE_TAG_IDS } from "../store-games.js";
import {
  DEFAULT_TUNE_OPTIONS,
  TUNE_SETTINGS_VERSION,
  type TuneBasis,
  type TuneOptions,
  type TuneSettings,
} from "./types.js";

const BASES: readonly TuneBasis[] = ["groups", "games", "tags"];
const OLD_BASES: Record<string, TuneBasis> = {
  "all-time": "groups",
  recent: "groups",
  picked: "games",
};

/**
 * Stored Tune settings in today's shape. Version 1 had an idle rule (on by
 * default) instead of idle tags in the avoid list: a person who had it on
 * gets the idle tags added to their avoid list once, and keeps whatever they
 * remove later.
 */
export const migrateTuneSettings = (stored: unknown): TuneSettings => {
  const record = (stored ?? {}) as Partial<TuneSettings> & {
    options?: Partial<TuneOptions> & { idleDiscount?: boolean };
  };
  const raw: Partial<TuneOptions> & { idleDiscount?: boolean } =
    record.options ?? {};
  const { idleDiscount, ...rest } = raw;
  const options: TuneOptions = { ...DEFAULT_TUNE_OPTIONS, ...rest };

  const version = record.version ?? 1;
  if (stored && version < 3 && options.recency === 0) {
    // Version 3 leans toward newer games by default.
    options.recency = DEFAULT_TUNE_OPTIONS.recency;
  }
  if (stored && version < 2) {
    if (idleDiscount !== false) {
      options.avoidTags = [...new Set([...options.avoidTags, ...IDLE_TAG_IDS])];
    }
    const basis = raw.basedOn as string | undefined;
    options.basedOn = OLD_BASES[basis ?? ""] ?? options.basedOn;
  }
  options.basedOn = OLD_BASES[options.basedOn] ?? options.basedOn;
  if (!BASES.includes(options.basedOn)) options.basedOn = "groups";

  return {
    version: TUNE_SETTINGS_VERSION,
    options,
    presets: (record.presets ?? []).map((preset) => {
      const { idleDiscount: _old, ...presetOptions } =
        preset.options as typeof preset.options & { idleDiscount?: boolean };
      const basis = presetOptions.basedOn as string;
      return {
        ...preset,
        options: {
          ...presetOptions,
          basedOn: OLD_BASES[basis] ?? presetOptions.basedOn,
          ...(version < 3 && presetOptions.recency === 0
            ? { recency: DEFAULT_TUNE_OPTIONS.recency }
            : {}),
        },
      };
    }),
    browsePresets: record.browsePresets ?? [],
    playedElsewhere: record.playedElsewhere ?? {},
  };
};
