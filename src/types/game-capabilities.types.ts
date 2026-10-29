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
}

export type SetGameCapabilityModeResult =
  | { ok: true }
  | { ok: false; message: string };
