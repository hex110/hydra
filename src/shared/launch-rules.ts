import type { LaunchRule } from "@types";

/** Built-in rules a new install starts with; each can be turned off or removed. */
export const HDR_LAUNCH_RULE_ID = "preset-hdr";

export const LAUNCH_RULE_PRESETS: LaunchRule[] = [
  {
    id: HDR_LAUNCH_RULE_ID,
    presetId: "hdr",
    name: "HDR",
    enabled: false,
    matchAllGames: true,
    files: [],
    // Wine's Wayland driver is needed for HDR. Valve and GE Proton read
    // PROTON_ENABLE_HDR; Proton-CachyOS only honours DXVK_HDR.
    launchOptions:
      "PROTON_ENABLE_WAYLAND=1 PROTON_ENABLE_HDR=1 DXVK_HDR=1 %command%",
  },
  {
    id: "preset-reshade",
    presetId: "reshade",
    name: "ReShade",
    enabled: true,
    files: ["ReShade.ini"],
    // ReShade installs as dxgi.dll and compiles shaders with d3dcompiler_47.
    launchOptions: "WINEDLLOVERRIDES=d3dcompiler_47=n;dxgi=n,b %command%",
  },
  {
    id: "preset-unity-vulkan",
    presetId: "unity-vulkan",
    name: "Unity games: Vulkan renderer",
    enabled: false,
    files: ["UnityPlayer.dll"],
    launchOptions: "%command% -force-vulkan",
  },
];

const patternCache = new Map<string, RegExp>();

const toRegExp = (pattern: string) => {
  let regExp = patternCache.get(pattern);
  if (!regExp) {
    const escaped = pattern
      .trim()
      .replaceAll(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replaceAll("*", ".*");
    regExp = new RegExp(`^${escaped}$`, "i");
    patternCache.set(pattern, regExp);
  }
  return regExp;
};

/** Whether a file or folder name matches a rule pattern (case-insensitive, `*` wildcards). */
export const matchesLaunchRulePattern = (name: string, pattern: string) =>
  pattern.trim().length > 0 && toRegExp(pattern).test(name);

/** Splits the comma- or newline-separated file list the settings page edits. */
export const parseLaunchRuleFiles = (value: string) =>
  value
    .split(/[,\n]/)
    .map((file) => file.trim())
    .filter(Boolean);

const isLaunchRule = (value: unknown): value is LaunchRule => {
  if (!value || typeof value !== "object") return false;
  const rule = value as Record<string, unknown>;
  return (
    typeof rule.id === "string" &&
    typeof rule.name === "string" &&
    typeof rule.enabled === "boolean" &&
    Array.isArray(rule.files) &&
    rule.files.every((file) => typeof file === "string") &&
    typeof rule.launchOptions === "string"
  );
};

/**
 * Reads rules exported from another install. Invalid entries are dropped and
 * ids are kept, so importing the same export twice replaces rather than
 * duplicates.
 */
export const parseLaunchRulesExport = (text: string): LaunchRule[] | null => {
  try {
    const parsed = JSON.parse(text) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : (parsed as { launchRules?: unknown })?.launchRules;
    if (!Array.isArray(list)) return null;
    return list.filter(isLaunchRule).map((rule) => ({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      ...(rule.matchAllGames === true ? { matchAllGames: true } : {}),
      files: rule.files,
      launchOptions: rule.launchOptions,
      ...(rule.presetId ? { presetId: rule.presetId } : {}),
    }));
  } catch {
    return null;
  }
};

/** Merges imported rules into the current ones, replacing rules with the same id. */
export const mergeLaunchRules = (
  current: LaunchRule[],
  imported: LaunchRule[]
): LaunchRule[] => {
  const importedIds = new Set(imported.map((rule) => rule.id));
  return [...current.filter((rule) => !importedIds.has(rule.id)), ...imported];
};

/** The rules in effect: the user's list, or the presets before it was ever edited. */
export const resolveLaunchRules = (
  launchRules: LaunchRule[] | null | undefined
): LaunchRule[] => launchRules ?? LAUNCH_RULE_PRESETS;

/** Whether a rule applies to a game, given the game's overrides. */
export const isLaunchRuleApplied = (
  rule: LaunchRule,
  overrides: Record<string, boolean> | null | undefined
) => overrides?.[rule.id] ?? rule.enabled;
