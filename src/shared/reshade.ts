import type { UserPreferences } from "@types";
import {
  applyIniOverrides,
  parseIniOverrides,
  type IniOverride,
} from "./ini-overrides.js";

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

/**
 * What a new ReShade.ini starts with. The tutorial is marked as done so the
 * first launch goes straight to the game; ReShade finds add-ons next to the
 * game by itself, so no add-on path is needed.
 */
export const RESHADE_SEED_INI = [
  "[GENERAL]",
  "EffectSearchPaths=.\\reshade-shaders\\Shaders\\**",
  "TextureSearchPaths=.\\reshade-shaders\\Textures\\**",
  "",
  "[OVERLAY]",
  "TutorialProgress=4",
  "",
].join("\r\n");

/**
 * The ReShade.ini to write: the existing file with the overrides applied, or
 * the seed with them applied for a game that has none. An existing file keeps
 * everything else the user set.
 */
export const buildReShadeIni = (
  existing: string | null,
  overrides: IniOverride[]
) => applyIniOverrides(existing ?? RESHADE_SEED_INI, overrides);
