import {
  capabilityModeFromOverride,
  getCapabilityOverride,
} from "../../../shared/game-capabilities.js";
import { isLaunchRuleApplied } from "../../../shared/launch-rules.js";
import { optiScalerSuitsGpu } from "../machine/machine-profile-core.js";
import type {
  Game,
  GameCapability,
  GameCapabilityId,
  GameCapabilityMode,
  GameCapabilityNeed,
  GameCapabilityReason,
  GameOptiScalerStatus,
  GameRenoDxStatus,
  GpuUpscalerFit,
  LaunchRule,
  MachineGpu,
  UserPreferences,
} from "@types";

const ALL_MODES: GameCapabilityMode[] = ["auto", "on", "off"];

const capability = (
  id: GameCapabilityId,
  game: Game,
  state: {
    active: boolean;
    blocked?: boolean;
    reason: GameCapabilityReason;
    modes?: GameCapabilityMode[];
    needs?: GameCapabilityNeed[];
    failed?: boolean;
  }
): GameCapability => ({
  id,
  mode: capabilityModeFromOverride(getCapabilityOverride(game, id)),
  modes: state.modes ?? ALL_MODES,
  active: state.active,
  blocked: state.blocked ?? false,
  reason: state.reason,
  needs: state.needs ?? [],
  failed: state.failed ?? false,
});

const reason = (
  code: string,
  params?: GameCapabilityReason["params"]
): GameCapabilityReason => (params ? { code, params } : { code });

/** Hydra's own install went wrong on its first run; a chosen mode clears it. */
const failedFirstRun = (game: Game, id: "renodx" | "optiscaler") =>
  getCapabilityOverride(game, id) === null
    ? (game.capabilityChecks?.[id] ?? null)
    : null;

export const resolveOnlineFix = (
  game: Game,
  userPreferences: UserPreferences | null
): GameCapability => {
  // Forcing OnlineFix on without its files would do nothing.
  const modes: GameCapabilityMode[] = ["auto", "off"];
  if (game.onlineFixDisabled)
    return capability("online_fix", game, {
      active: false,
      modes,
      reason: reason("set_off_for_game"),
    });
  if (userPreferences?.prepareOnlineFixGames === false)
    return capability("online_fix", game, {
      active: false,
      modes,
      reason: reason("online_fix_off_in_settings"),
    });
  if (game.onlineFix)
    return capability("online_fix", game, {
      active: true,
      modes,
      reason: reason("online_fix_found", {
        dlls:
          game.onlineFix.proxyDlls.map((dll) => `${dll}.dll`).join(", ") || "-",
      }),
    });
  return capability("online_fix", game, {
    active: false,
    modes,
    reason: reason(
      game.onlineFix === undefined
        ? "online_fix_not_checked"
        : "online_fix_not_found"
    ),
  });
};

export const resolveLaunchRuleCapability = (
  id: "hdr" | "hdr_monitor",
  game: Game,
  rule: LaunchRule | undefined,
  options: {
    canSwitchMonitor: boolean;
    /** The game's overrides plus the rules its tools depend on. */
    effectiveOverrides?: Record<string, boolean>;
    /** False when no connected display accepts HDR. */
    hdrDisplay?: boolean;
  }
): GameCapability => {
  if (!rule)
    return capability(id, game, {
      active: false,
      modes: [],
      reason: reason("rule_removed"),
    });

  const override = getCapabilityOverride(game, id);
  const wanted = isLaunchRuleApplied(
    rule,
    options.effectiveOverrides ?? game.launchRuleOverrides
  );
  const neededByTool =
    override === null && wanted && !!game.renoDx && !rule.enabled;
  const why =
    override === true
      ? reason(game.renoDx ? "set_on_for_game_renodx" : "set_on_for_game")
      : override === false
        ? reason("set_off_for_game")
        : neededByTool
          ? reason("needed_by_renodx")
          : reason(
              rule.enabled
                ? "rule_on_for_every_game"
                : "rule_off_for_every_game"
            );

  if (id === "hdr_monitor" && wanted && !options.canSwitchMonitor)
    return capability(id, game, {
      active: false,
      blocked: true,
      reason: reason(
        options.hdrDisplay === false ? "no_hdr_display" : "needs_hyprland"
      ),
    });

  return capability(id, game, { active: wanted, reason: why });
};

export const resolveRenoDx = (
  game: Game,
  status: GameRenoDxStatus,
  autoInstall: boolean,
  needs: GameCapabilityNeed[] = [],
  /** False when no connected display accepts HDR. */
  hdrDisplay?: boolean
): GameCapability => {
  const override = getCapabilityOverride(game, "renodx");
  const modTitle = status.mod?.title ?? "";

  if (status.installation) {
    const unmet = needs.find((need) => !need.met);
    const failedCheck = failedFirstRun(game, "renodx");
    return capability("renodx", game, {
      active: true,
      failed: !!failedCheck,
      // Installed, but it cannot give HDR: say what is missing.
      blocked: !!unmet,
      needs,
      reason:
        failedCheck?.reason ??
        unmet?.reason ??
        reason("renodx_installed", {
          mod: status.installation.modTitle,
          // Add-ons are nightly builds versioned by their build time.
          version: status.installation.addonVersion.replace(
            /^(\d{4}-\d{2}-\d{2})T.*$/,
            "$1"
          ),
        }),
    });
  }
  if (override === false)
    return capability("renodx", game, {
      active: false,
      reason: reason("set_off_for_game"),
    });

  const blocked = override === true;
  if (status.externallyManaged)
    return capability("renodx", game, {
      active: false,
      blocked,
      reason: reason("renodx_external"),
    });
  if (status.unavailable)
    return capability("renodx", game, {
      active: false,
      blocked,
      reason: reason(`renodx_${status.unavailable.replaceAll("-", "_")}`),
    });
  if (status.conflict)
    return capability("renodx", game, {
      active: false,
      blocked,
      reason: reason("renodx_conflict", { file: status.conflict.fileName }),
    });
  if (blocked)
    return capability("renodx", game, {
      active: false,
      blocked,
      reason: reason("renodx_not_installed", { mod: modTitle }),
    });
  if (status.antiCheat)
    return capability("renodx", game, {
      active: false,
      reason: reason("renodx_anti_cheat", { name: status.antiCheat }),
    });
  if (hdrDisplay === false)
    return capability("renodx", game, {
      active: false,
      reason: reason("renodx_no_hdr_display", { mod: modTitle }),
    });
  return capability("renodx", game, {
    active: false,
    reason: reason(
      autoInstall ? "renodx_available" : "renodx_auto_install_off",
      { mod: modTitle }
    ),
  });
};

export const resolveOptiScaler = (
  game: Game,
  status: Omit<GameOptiScalerStatus, "conflictingWrappers">,
  autoInstall: boolean,
  upscalerFit: GpuUpscalerFit | null = null
): GameCapability => {
  const override = getCapabilityOverride(game, "optiscaler");

  if (status.installation) {
    const failedCheck = failedFirstRun(game, "optiscaler");
    return capability("optiscaler", game, {
      active: true,
      failed: !!failedCheck,
      reason:
        failedCheck?.reason ??
        reason("optiscaler_installed", {
          version: status.installation.version,
          dll: status.installation.proxyDll,
        }),
    });
  }
  if (override === false)
    return capability("optiscaler", game, {
      active: false,
      reason: reason("set_off_for_game"),
    });

  const blocked = override === true;
  if (status.externallyManaged)
    return capability("optiscaler", game, {
      active: false,
      blocked,
      reason: reason("optiscaler_external"),
    });
  const eligibility = status.eligibility;
  if (!eligibility)
    return capability("optiscaler", game, {
      active: false,
      blocked,
      reason: reason("not_windows_game"),
    });
  if (eligibility.blocked)
    return capability("optiscaler", game, {
      active: false,
      blocked,
      reason: reason("optiscaler_not_working"),
    });
  if (blocked)
    return capability("optiscaler", game, {
      active: false,
      blocked,
      reason: reason("optiscaler_not_installed"),
    });
  if (!eligibility.eligible)
    return capability("optiscaler", game, {
      active: false,
      reason: reason("optiscaler_not_eligible"),
    });
  const found = eligibility.upscalerLibraries.join(", ");
  if (
    autoInstall &&
    !optiScalerSuitsGpu(upscalerFit, eligibility.upscalerLibraries)
  )
    return capability("optiscaler", game, {
      active: false,
      reason: reason(`optiscaler_gpu_${upscalerFit}`, { found: found || "-" }),
    });
  return capability("optiscaler", game, {
    active: false,
    reason: reason(
      autoInstall ? "optiscaler_available" : "optiscaler_auto_install_off",
      { found: found || "-" }
    ),
  });
};

export const resolveLaunchWrapper = (
  id: "mangohud" | "gamemode",
  game: Game,
  options: {
    globallyOn: boolean;
    /** The first applied launch rule that turns the wrapper on. */
    ruleName: string | null;
    available: boolean;
    /** The global default is Auto: on where the program is installed. */
    auto?: boolean;
  }
): GameCapability => {
  const override = getCapabilityOverride(game, id);
  if (override === null && options.auto)
    return capability(id, game, {
      active: options.available,
      reason: reason(
        options.available ? "auto_on_installed" : "auto_off_not_installed"
      ),
    });
  const wanted = override ?? (options.globallyOn || options.ruleName !== null);
  const why =
    override === true
      ? reason("set_on_for_game")
      : override === false
        ? reason("set_off_for_game")
        : options.globallyOn
          ? reason("on_for_every_game")
          : options.ruleName
            ? reason("turned_on_by_rule", { rule: options.ruleName })
            : reason("off_for_every_game");

  if (wanted && !options.available)
    return capability(id, game, {
      active: false,
      blocked: true,
      reason: reason("not_installed_on_system"),
    });
  return capability(id, game, { active: wanted, reason: why });
};

/**
 * A hybrid laptop's second GPU. Auto leaves games on the GPU that drives the
 * screen until offload has been confirmed on real hardware; On runs the game
 * on the second GPU through PRIME render offload.
 */
export const resolveDiscreteGpu = (
  game: Game,
  offloadGpu: MachineGpu
): GameCapability => {
  const override = getCapabilityOverride(game, "discrete_gpu");
  const vendor = offloadGpu.vendor === "nvidia" ? "NVIDIA" : "AMD";
  if (override === true)
    return capability("discrete_gpu", game, {
      active: true,
      reason: reason("discrete_gpu_on", { vendor }),
    });
  return capability("discrete_gpu", game, {
    active: false,
    reason: reason(
      override === false ? "set_off_for_game" : "discrete_gpu_auto",
      { vendor }
    ),
  });
};
