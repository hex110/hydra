/** Things Hydra applies to a game, each set to Auto, On or Off per game. */
export type GameCapabilityId =
  | "online_fix"
  | "hdr"
  | "hdr_monitor"
  | "renodx"
  | "optiscaler"
  | "mangohud"
  | "gamemode";

export type GameCapabilityMode = "auto" | "on" | "off";

export interface GameCapabilityReason {
  /** Translation key suffix: `capability_reason_<code>`. */
  code: string;
  params?: Record<string, string | number>;
}

/** Something a capability depends on for its effect, and whether it is there. */
export interface GameCapabilityNeed {
  id: "hdr" | "hdr_monitor" | "proton_hdr";
  met: boolean;
  /** Translation key suffix: `capability_reason_<code>`. */
  reason: GameCapabilityReason;
}

/**
 * What the check of a capability's first run found. Only failures are kept;
 * a pass just clears the pending check.
 */
export interface GameCapabilityCheck {
  runId: string;
  at: string;
  reason: GameCapabilityReason;
}

export interface GameCapability {
  id: GameCapabilityId;
  mode: GameCapabilityMode;
  /** The modes this game can choose; Auto is always one of them. */
  modes: GameCapabilityMode[];
  /** Applies at the next launch, or is installed. */
  active: boolean;
  /** Should apply but cannot; the reason says why. */
  blocked: boolean;
  reason: GameCapabilityReason;
  /** What it depends on; empty for capabilities that stand alone. */
  needs: GameCapabilityNeed[];
  /** Hydra turned it on by itself and the first run after that went wrong. */
  failed: boolean;
}

export type SetGameCapabilityModeResult =
  | { ok: true }
  | { ok: false; message: string };
