import type { GameCapabilityId, LaunchRule, UserPreferences } from "@types";

import { CAPABILITY_LAUNCH_RULES } from "./game-capabilities.js";
import { resolveLaunchRules } from "./launch-rules.js";

/**
 * A capability's setting for every game: Auto lets Hydra decide per game,
 * Always and Never apply to every game that does not say otherwise.
 */
export type CapabilityDefault = "auto" | "always" | "never";

type DefaultsPreferences = Pick<
  UserPreferences,
  | "prepareOnlineFixGames"
  | "renoDxAutoInstall"
  | "optiScalerAutoInstall"
  | "autoRunMangohud"
  | "autoRunGamemode"
  | "launchRules"
>;

/**
 * What each capability's default can be. Installing tools has no Always: a
 * tool that does not fit a game would be forced into it, so Auto is as far as
 * it goes. Wrappers and launch rules have no Auto: they are on or off.
 */
export const CAPABILITY_DEFAULT_MODES: Record<
  GameCapabilityId,
  CapabilityDefault[]
> = {
  online_fix: ["auto", "never"],
  renodx: ["auto", "never"],
  optiscaler: ["auto", "never"],
  hdr: ["never", "always"],
  hdr_monitor: ["never", "always"],
  mangohud: ["never", "always"],
  gamemode: ["auto", "never", "always"],
  // Per game only until offload is confirmed on real hardware.
  discrete_gpu: ["never"],
};

const findRule = (
  preferences: DefaultsPreferences | null | undefined,
  id: GameCapabilityId
): LaunchRule | undefined =>
  resolveLaunchRules(preferences?.launchRules).find(
    (rule) => rule.id === CAPABILITY_LAUNCH_RULES[id]
  );

export const getCapabilityDefault = (
  id: GameCapabilityId,
  preferences: DefaultsPreferences | null | undefined
): CapabilityDefault => {
  switch (id) {
    case "online_fix":
      return preferences?.prepareOnlineFixGames === false ? "never" : "auto";
    case "renodx":
      return preferences?.renoDxAutoInstall === true ? "auto" : "never";
    case "optiscaler":
      return preferences?.optiScalerAutoInstall === false ? "never" : "auto";
    case "mangohud":
      return preferences?.autoRunMangohud === true ? "always" : "never";
    case "gamemode":
      // Unset is Auto: on wherever GameMode is installed.
      if (preferences?.autoRunGamemode === true) return "always";
      return preferences?.autoRunGamemode === false ? "never" : "auto";
    case "hdr":
    case "hdr_monitor":
      return findRule(preferences, id)?.enabled ? "always" : "never";
    case "discrete_gpu":
      return "never";
  }
};

/** The preference changes that set a capability's default. */
export const capabilityDefaultPatch = (
  id: GameCapabilityId,
  mode: CapabilityDefault,
  preferences: DefaultsPreferences | null | undefined
): Partial<UserPreferences> => {
  switch (id) {
    case "online_fix":
      return { prepareOnlineFixGames: mode !== "never" };
    case "renodx":
      return { renoDxAutoInstall: mode === "auto" };
    case "optiscaler":
      return { optiScalerAutoInstall: mode === "auto" };
    case "mangohud":
      return { autoRunMangohud: mode === "always" };
    case "gamemode":
      return {
        autoRunGamemode: mode === "auto" ? undefined : mode === "always",
      };
    case "discrete_gpu":
      return {};
    case "hdr":
    case "hdr_monitor": {
      const ruleId = CAPABILITY_LAUNCH_RULES[id];
      return {
        launchRules: resolveLaunchRules(preferences?.launchRules).map((rule) =>
          rule.id === ruleId ? { ...rule, enabled: mode === "always" } : rule
        ),
      };
    }
  }
};
