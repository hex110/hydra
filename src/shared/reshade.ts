import type { UserPreferences } from "@types";
import { parseIniOverrides, type IniOverride } from "./ini-overrides.js";

export const RESHADE_INI_FILE = "ReShade.ini";

/**
 * ReShade opens its overlay with Home, which many keyboards lack. The value is
 * `virtual key, ctrl, shift, alt`; 121 is F10.
 */
export const DEFAULT_RESHADE_INI_OVERRIDES = "[INPUT]\nKeyOverlay=121,0,0,0";

/** An empty setting means no overrides; an unset one means the defaults. */
export const resolveReShadeIniOverrides = (
  preferences: UserPreferences | null | undefined
): IniOverride[] =>
  parseIniOverrides(
    preferences?.reShadeIniOverrides ?? DEFAULT_RESHADE_INI_OVERRIDES
  ).overrides;
