import type {
  Game,
  GameCapabilityId,
  GameCapabilityMode,
  UserPreferences,
} from "@types";

import {
  HDR_LAUNCH_RULE_ID,
  HYPRLAND_HDR_LAUNCH_RULE_ID,
} from "./launch-rules.js";

/** Launch rules that are shown and set as capabilities, not in the rule list. */
export const CAPABILITY_LAUNCH_RULES: Partial<
  Record<GameCapabilityId, string>
> = {
  hdr: HDR_LAUNCH_RULE_ID,
  hdr_monitor: HYPRLAND_HDR_LAUNCH_RULE_ID,
};

type CapabilityGame = Pick<
  Game,
  | "onlineFixDisabled"
  | "launchRuleOverrides"
  | "renoDxAutoInstallDisabled"
  | "optiScalerAutoInstallDisabled"
  | "capabilityOverrides"
  | "autoRunMangohud"
  | "autoRunGamemode"
>;

/**
 * The game's own choice for a capability: true for On, false for Off, null
 * for Auto. Each capability keeps the field it had before capabilities
 * existed, so older code that reads those fields stays right.
 */
export const getCapabilityOverride = (
  game: CapabilityGame | null | undefined,
  id: GameCapabilityId
): boolean | null => {
  if (!game) return null;
  switch (id) {
    case "online_fix":
      return game.onlineFixDisabled ? false : null;
    case "hdr":
    case "hdr_monitor":
      return game.launchRuleOverrides?.[CAPABILITY_LAUNCH_RULES[id]!] ?? null;
    case "renodx":
      if (game.renoDxAutoInstallDisabled) return false;
      return game.capabilityOverrides?.renodx === true ? true : null;
    case "optiscaler":
      if (game.optiScalerAutoInstallDisabled) return false;
      return game.capabilityOverrides?.optiscaler === true ? true : null;
    case "mangohud":
      return (
        game.capabilityOverrides?.mangohud ??
        (game.autoRunMangohud === true ? true : null)
      );
    case "gamemode":
      return (
        game.capabilityOverrides?.gamemode ??
        (game.autoRunGamemode === true ? true : null)
      );
  }
};

export const capabilityModeFromOverride = (
  override: boolean | null
): GameCapabilityMode => (override === null ? "auto" : override ? "on" : "off");

export const capabilityOverrideFromMode = (mode: GameCapabilityMode) =>
  mode === "auto" ? null : mode === "on";

/**
 * Whether MangoHud or GameMode wraps the game: the game's choice first, then
 * the global setting or a launch rule that turns it on.
 */
export const isLaunchWrapperWanted = (
  id: "mangohud" | "gamemode",
  game: CapabilityGame | null | undefined,
  userPreferences: Pick<
    UserPreferences,
    "autoRunMangohud" | "autoRunGamemode"
  > | null,
  turnedOnByRule = false
) => {
  const override = getCapabilityOverride(game, id);
  if (override !== null) return override;
  const global =
    id === "mangohud"
      ? userPreferences?.autoRunMangohud
      : userPreferences?.autoRunGamemode;
  return global === true || turnedOnByRule;
};
