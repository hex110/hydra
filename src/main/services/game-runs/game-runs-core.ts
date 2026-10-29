import path from "node:path";

import type { GameRun, GameRunOutcome, GameShop } from "@types";

export const RUN_FILE = "run.json";
export const SUMMARY_FILE = "summary.md";
export const LATEST_LINK = "latest";
export const RUNS_KEPT_PER_GAME = 20;
/** Logs bigger than this keep only their end. */
export const MAX_LOG_BYTES = 5 * 1024 * 1024;
const CLOSED_EARLY_WINDOW_MS = 60_000;

const slugify = (value: string) =>
  value
    .normalize("NFKD")
    .replaceAll(/[^\w\s-]/g, "")
    .trim()
    .replaceAll(/[\s_-]+/g, "-")
    .toLowerCase()
    .slice(0, 60);

const safeSegment = (value: string) => value.replaceAll(/[^\w.-]/g, "_");

/** Ends every game folder name, so a renamed game keeps its folder. */
export const gameFolderSuffix = (shop: GameShop, objectId: string) =>
  `--${safeSegment(shop)}-${safeSegment(objectId)}`;

export const gameFolderName = (
  title: string,
  shop: GameShop,
  objectId: string
) => `${slugify(title) || "game"}${gameFolderSuffix(shop, objectId)}`;

/** Sorts in time order and is safe in file names on every platform. */
export const runIdFromDate = (date: Date) =>
  date
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d+Z$/, "Z");

export const classifyRunOutcome = ({
  exitCode,
  signal,
  gameDetected,
  durationInMilliseconds,
}: {
  exitCode: number | null;
  signal: string | null;
  gameDetected: boolean;
  durationInMilliseconds: number;
}): GameRunOutcome => {
  if (!gameDetected && durationInMilliseconds < CLOSED_EARLY_WINDOW_MS)
    return "closed_early";
  if (signal || (exitCode !== null && exitCode !== 0)) return "error";
  return "ended";
};

/** Runs to delete: everything past the newest `keep`, never a running one. */
export const selectRunsToPrune = (runIds: string[], keep: number) =>
  [...runIds].sort().reverse().slice(keep);

const formatDuration = (milliseconds: number | null) => {
  if (milliseconds === null) return "unknown";
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ${seconds % 60} s`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

const OUTCOME_TEXT: Record<GameRunOutcome, string> = {
  running: "still running",
  ended: "ended normally",
  error: "ended with an error",
  closed_early: "closed right after starting",
  launch_failed: "failed to launch",
  unknown: "end not seen (Hydra was closed)",
};

/**
 * Plain-text report of one run, written beside the logs and copied by
 * "Copy diagnostics", so it can be pasted into a bug report or an agent.
 */
export const formatRunSummary = (run: GameRun) => {
  const exit =
    run.signal !== null
      ? `signal ${run.signal}`
      : run.exitCode !== null
        ? `code ${run.exitCode}`
        : "not known";

  const lines = [
    `# ${run.title}: run ${run.id}`,
    "",
    `- Game: ${run.shop}/${run.objectId}`,
    `- Outcome: ${OUTCOME_TEXT[run.outcome]} (exit ${exit})`,
    `- Started: ${run.startedAt}`,
    `- Duration: ${formatDuration(run.durationInMilliseconds)}`,
    `- Game seen running: ${run.gameDetected ? "yes" : "no"}`,
    `- Launcher: ${run.launcher ?? "none"}`,
    `- Proton: ${run.protonPath ? path.basename(run.protonPath) : run.launcher === "umu" ? "umu's default" : "none"}`,
    `- Executable: ${run.executablePath}`,
  ];
  if (run.winePrefixPath) lines.push(`- Prefix: ${run.winePrefixPath}`);
  lines.push(`- Run folder: ${run.directory}`);

  lines.push("", "## Tools");
  if (run.tools.length === 0) lines.push("", "None installed by Hydra.");
  else {
    lines.push("");
    for (const tool of run.tools)
      lines.push(
        `- ${tool.name} ${tool.version}${tool.detail ? ` (${tool.detail})` : ""}`
      );
  }

  if (run.commandLine)
    lines.push("", "## Command", "", "```", run.commandLine, "```");

  const environment = Object.entries(run.environment);
  if (environment.length > 0) {
    lines.push("", "## Environment set by Hydra", "", "```");
    for (const [key, value] of environment) lines.push(`${key}=${value}`);
    lines.push("```");
  }

  if (run.events.length > 0) {
    lines.push("", "## Events", "");
    for (const event of run.events)
      lines.push(`- ${event.at} ${event.message}`);
  }

  lines.push("", "## Logs", "");
  if (run.logs.length === 0) lines.push("No logs were found for this run.");
  for (const log of run.logs)
    lines.push(
      `- ${log.name}: from ${log.source}${log.truncated ? " (end only)" : ""}`
    );

  return `${lines.join("\n")}\n`;
};
