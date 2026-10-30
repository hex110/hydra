import type {
  GameCapabilityId,
  GameCapabilityReason,
} from "./game-capabilities.types";
import type { GameShop } from "./game.types";

export type GameRunOutcome =
  | "running"
  /** The game ended with exit code 0, or ended while Hydra could not see a code. */
  | "ended"
  /** Exit code other than 0, or killed by a signal. */
  | "error"
  /** Ended within a minute without the game ever being seen running. */
  | "closed_early"
  /** Nothing could be started. */
  | "launch_failed"
  /** Hydra closed or crashed while the game ran, so the end was not seen. */
  | "unknown";

export type GameRunLauncher = "umu" | "wine" | "native";

export interface GameRunTool {
  name: string;
  version: string;
  detail?: string | null;
}

export interface GameRunEvent {
  at: string;
  message: string;
}

export interface GameRunLogFile {
  /** File name inside the run folder. */
  name: string;
  /** Where it was copied from. */
  source: string;
  sizeInBytes: number;
  /** Only the end of the file was kept. */
  truncated: boolean;
}

/** What a run's logs and ending say about one tool installed in the game. */
export interface GameRunCheck {
  capability: Extract<GameCapabilityId, "renodx" | "optiscaler">;
  /** Failed has evidence; unclear could not be told either way. */
  status: "ok" | "failed" | "unclear";
  /** For the interface: `capability_reason_<code>`. */
  reason: GameCapabilityReason;
  /** The same finding in plain English, for the run's summary. */
  message: string;
}

export interface GameRun {
  id: string;
  shop: GameShop;
  objectId: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  durationInMilliseconds: number | null;
  outcome: GameRunOutcome;
  exitCode: number | null;
  signal: string | null;
  /** The process watcher saw the game running. */
  gameDetected: boolean;
  launcher: GameRunLauncher | null;
  executablePath: string;
  commandLine: string | null;
  /** Environment Hydra added; the rest is inherited. */
  environment: Record<string, string>;
  protonPath: string | null;
  winePrefixPath: string | null;
  tools: GameRunTool[];
  events: GameRunEvent[];
  logs: GameRunLogFile[];
  /** Checks of the tools Hydra installed; runs from before they existed have none. */
  checks?: GameRunCheck[];
  /** Absolute path of the run's folder. */
  directory: string;
}
