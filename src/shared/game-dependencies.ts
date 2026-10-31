import type { Game, GameCapabilityNeed, GameCapabilityReason } from "@types";

import {
  HDR_LAUNCH_RULE_ID,
  HYPRLAND_HDR_LAUNCH_RULE_ID,
} from "./launch-rules.js";

export type WaylandHdrSupport = "yes" | "no" | "unknown";

const firstNumber = (name: string) => {
  const match = /\d+/.exec(name);
  return match ? Number(match[0]) : null;
};

/**
 * Whether a Proton build gives RenoDX an HDR swapchain. Only what was tested
 * is claimed (docs/renodx-hdr-plan.md, finding 11): GE-Proton 11 works and
 * UMU-Proton 10, umu's default when no build is chosen, does not. Any other
 * build is "unknown" and never blocks anything.
 */
export const protonWaylandHdr = (
  buildName: string | null
): WaylandHdrSupport => {
  if (!buildName) return "no";
  const lower = buildName.toLowerCase();
  const major = firstNumber(lower);
  if (lower.startsWith("umu-proton"))
    return major !== null && major <= 10 ? "no" : "unknown";
  if (lower.startsWith("ge-proton"))
    return major !== null && major >= 11 ? "yes" : "unknown";
  return "unknown";
};

/**
 * The launch rule overrides a launch uses: the game's own, plus the rules a
 * tool installed in the game depends on. RenoDX only gets HDR with the
 * built-in HDR rule and, where Hydra can do it, the monitor switch. The game's
 * own choice always wins, so Off keeps a dependency off.
 */
export const withDependencyRuleOverrides = (
  game: Pick<Game, "renoDx" | "launchRuleOverrides"> | null | undefined,
  options: { enableHdrRules: boolean; canSwitchMonitor: boolean }
): Record<string, boolean> => {
  const overrides = { ...game?.launchRuleOverrides };
  if (!game?.renoDx || !options.enableHdrRules) return overrides;
  overrides[HDR_LAUNCH_RULE_ID] ??= true;
  if (options.canSwitchMonitor) overrides[HYPRLAND_HDR_LAUNCH_RULE_ID] ??= true;
  return overrides;
};

const reason = (
  code: string,
  params?: GameCapabilityReason["params"]
): GameCapabilityReason => (params ? { code, params } : { code });

/** What RenoDX needs for HDR, and whether each need is met for this game. */
export const resolveRenoDxNeeds = ({
  hdrActive,
  monitorActive,
  canSwitchMonitor,
  protonName,
  hdrDisplay,
}: {
  hdrActive: boolean;
  monitorActive: boolean;
  /** Whether a connected display accepts HDR; undefined when unknown. */
  hdrDisplay?: boolean;
  /** Only Hyprland with `hypr-hdr` can; elsewhere the user's compositor decides. */
  canSwitchMonitor: boolean;
  /** The Proton build the game launches with; null for umu's default. */
  protonName: string | null;
}): GameCapabilityNeed[] => {
  const needs: GameCapabilityNeed[] = [];
  if (hdrDisplay !== undefined)
    needs.push({
      id: "hdr_display",
      met: hdrDisplay,
      reason: reason(
        hdrDisplay ? "need_hdr_display_met" : "need_hdr_display_no"
      ),
    });
  needs.push({
    id: "hdr",
    met: hdrActive,
    reason: reason(hdrActive ? "need_hdr_met" : "need_hdr_off"),
  });
  if (canSwitchMonitor)
    needs.push({
      id: "hdr_monitor",
      met: monitorActive,
      reason: reason(monitorActive ? "need_monitor_met" : "need_monitor_off"),
    });

  const support = protonWaylandHdr(protonName);
  needs.push({
    id: "proton_hdr",
    met: support !== "no",
    reason:
      support === "yes"
        ? reason("need_proton_met", { build: protonName ?? "" })
        : support === "no"
          ? reason(
              protonName ? "need_proton_no" : "need_proton_default",
              protonName ? { build: protonName } : undefined
            )
          : reason("need_proton_unknown", { build: protonName ?? "" }),
  });
  return needs;
};
