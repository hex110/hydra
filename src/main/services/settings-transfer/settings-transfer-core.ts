import type { UserPreferences } from "@types";

export const SETTINGS_FILE_FORMAT = "hydra-plus-settings";
export const SETTINGS_FILE_VERSION = 1;

export interface SettingsFile {
  format: typeof SETTINGS_FILE_FORMAT;
  version: number;
  exportedAt: string;
  includesSecrets: boolean;
  preferences: Partial<UserPreferences>;
}

/** API keys and tokens: left out unless the user asks for them. */
const isSecretKey = (key: string) => /(key|token|secret|password)$/i.test(key);

/** Settings that only make sense on the machine they were made on. */
const MACHINE_ONLY: (keyof UserPreferences)[] = ["torrentNetworkInterface"];

const HOME_MARKER = "~";

/** Rewrites every string that starts with `from` to start with `to` instead. */
const rewritePaths = (value: unknown, from: string, to: string): unknown => {
  if (typeof value === "string")
    return value === from || value.startsWith(`${from}/`)
      ? `${to}${value.slice(from.length)}`
      : value;
  if (Array.isArray(value))
    return value.map((item) => rewritePaths(item, from, to));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        rewritePaths(item, from, to),
      ])
    );
  return value;
};

/**
 * The settings file for another machine: preferences with the home folder
 * written as `~`, without secrets unless asked, and without settings that
 * belong to this machine.
 */
export const buildSettingsFile = (
  preferences: UserPreferences | null,
  options: { homePath: string; includeSecrets: boolean; now: Date }
): SettingsFile => {
  const kept = Object.fromEntries(
    Object.entries(preferences ?? {}).filter(
      ([key, value]) =>
        value !== undefined &&
        !MACHINE_ONLY.includes(key as keyof UserPreferences) &&
        (options.includeSecrets || !isSecretKey(key))
    )
  );
  return {
    format: SETTINGS_FILE_FORMAT,
    version: SETTINGS_FILE_VERSION,
    exportedAt: options.now.toISOString(),
    includesSecrets: options.includeSecrets,
    preferences: rewritePaths(
      kept,
      options.homePath,
      HOME_MARKER
    ) as Partial<UserPreferences>,
  };
};

/**
 * The preferences a settings file sets on this machine, with `~` turned back
 * into this machine's home folder. Throws on a file that is not one.
 */
export const readSettingsFile = (
  contents: string,
  options: { homePath: string }
): Partial<UserPreferences> => {
  const file = JSON.parse(contents) as Partial<SettingsFile>;
  if (file.format !== SETTINGS_FILE_FORMAT || !file.preferences)
    throw new Error("not_a_settings_file");
  if ((file.version ?? 0) > SETTINGS_FILE_VERSION)
    throw new Error("settings_file_too_new");
  const preferences = Object.fromEntries(
    Object.entries(file.preferences).filter(
      ([key]) => !MACHINE_ONLY.includes(key as keyof UserPreferences)
    )
  );
  return rewritePaths(
    preferences,
    HOME_MARKER,
    options.homePath
  ) as Partial<UserPreferences>;
};
