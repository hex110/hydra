import type { GameRun, GameRunCheck } from "@types";

type CheckedTool = GameRunCheck["capability"];
type Finding = Pick<GameRunCheck, "status" | "reason" | "message">;

/** A tool needs this long running before a missing log means something. */
const MIN_RUNNING_MS = 20_000;
/** Same window the run history uses for "closed early". */
const EARLY_EXIT_MS = 60_000;

const TOOL_NAMES: Record<CheckedTool, string> = {
  renodx: "RenoDX",
  optiscaler: "OptiScaler",
};

/**
 * RenoDX logs `ChangeColorSpace(Failed to set DirectX color space, hr =
 * 0x80070057)` when the swapchain cannot go HDR: the wrong Proton build or a
 * monitor that is not in HDR (docs/renodx-hdr-plan.md, findings 3 and 11).
 * The text is from RenoDX's src/utils/swapchain.hpp, checked 2026-10-31.
 */
const COLOUR_SPACE_FAILURE =
  /ChangeColorSpace[^\n]*(fail|0x8007|error)|(fail|could not|couldn't|unable)[^\n]*(set|change)[^\n]*colou?r ?space/i;

const finding = (
  status: Finding["status"],
  code: string,
  message: string
): Finding => ({ status, reason: { code }, message });

const isEarlyExit = (
  run: Pick<GameRun, "outcome" | "durationInMilliseconds">
) =>
  run.outcome === "closed_early" ||
  run.outcome === "launch_failed" ||
  (run.outcome === "error" &&
    (run.durationInMilliseconds ?? Infinity) < EARLY_EXIT_MS);

const checkRenoDx = (
  run: Pick<GameRun, "gameDetected" | "durationInMilliseconds">,
  log: string | undefined
): Finding => {
  if (log !== undefined && COLOUR_SPACE_FAILURE.test(log))
    return finding(
      "failed",
      "check_renodx_colour_space",
      "RenoDX could not set the HDR colour space (ChangeColorSpace failed in ReShade.log). The Proton build or the monitor is not in HDR."
    );
  if (log !== undefined)
    return finding("ok", "check_loaded", "ReShade.log shows RenoDX loaded.");
  return (run.durationInMilliseconds ?? 0) >= MIN_RUNNING_MS && run.gameDetected
    ? finding(
        "unclear",
        "check_renodx_no_log",
        "ReShade wrote no log during the run, so it may not have loaded."
      )
    : finding("unclear", "check_too_short", "The run was too short to tell.");
};

const checkOptiScaler = (
  run: Pick<GameRun, "gameDetected" | "durationInMilliseconds">,
  log: string | undefined
): Finding => {
  if (log !== undefined)
    return finding(
      "ok",
      "check_loaded",
      "OptiScaler.log shows OptiScaler loaded."
    );
  // OptiScaler only logs to a file when LogToFile is on, so a missing log is
  // not proof that it failed to load.
  return (run.durationInMilliseconds ?? 0) >= MIN_RUNNING_MS && run.gameDetected
    ? finding(
        "unclear",
        "check_optiscaler_no_log",
        "OptiScaler wrote no log during the run; it may not have loaded, or LogToFile is off."
      )
    : finding("unclear", "check_too_short", "The run was too short to tell.");
};

/**
 * What a finished run says about the tools Hydra installed in the game.
 * Evidence in a log decides; without it, a game that ended within a minute is
 * blamed on the tools, since an automatic install is the first thing to rule out.
 * `logs` maps a log's file name to its text.
 */
export const evaluateRunChecks = (
  run: Pick<
    GameRun,
    "outcome" | "gameDetected" | "durationInMilliseconds" | "tools"
  >,
  logs: Record<string, string>
): GameRunCheck[] => {
  // The end of a run Hydra did not see says nothing.
  if (run.outcome === "running" || run.outcome === "unknown") return [];

  const installed = new Set(run.tools.map((tool) => tool.name));
  const earlyExit = isEarlyExit(run);
  const checks: GameRunCheck[] = [];

  const add = (capability: CheckedTool, result: Finding) => {
    const name = TOOL_NAMES[capability];
    checks.push(
      earlyExit && result.status !== "failed"
        ? {
            capability,
            status: "failed",
            reason: { code: "check_early_exit", params: { tool: name } },
            message: `The game ended within a minute of starting with ${name} installed (${run.outcome}); ${name} may be the cause.`,
          }
        : { capability, ...result }
    );
  };

  if (installed.has("RenoDX"))
    add("renodx", checkRenoDx(run, logs["ReShade.log"]));
  if (installed.has("OptiScaler"))
    add("optiscaler", checkOptiScaler(run, logs["OptiScaler.log"]));
  return checks;
};
