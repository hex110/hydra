/** The user's corrections to what Hydra detected; a null or missing field means "use the detected value". */
export interface SystemSpecsOverrides {
  /** A model id from the hardware table. */
  cpuId?: string | null;
  gpuId?: string | null;
  ramGb?: number | null;
}

/** What Hydra read from the machine, matched to the hardware table. */
export interface DetectedSpecs {
  cpuName: string | null;
  cpuId: string | null;
  gpuName: string | null;
  /**
   * Table models the GPU could be. Several when one PCI id covers a family
   * (RX 9070, 9070 XT and 9070 GRE share `1002:7550`); empty when unknown.
   */
  gpuIds: string[];
  /** A laptop chip: the table lists desktop scores, so it is scaled down. */
  gpuMobile: boolean;
  ramGb: number | null;
}

export type SpecSource = "detected" | "edited";

/** The specs the checker compares with: detected values with the user's edits on top. */
export interface ResolvedSpecs {
  cpuId: string | null;
  cpuSource: SpecSource;
  gpuId: string | null;
  gpuSource: SpecSource;
  /** True when the GPU is only a guess between several models and not edited. */
  gpuAmbiguous: boolean;
  gpuMobile: boolean;
  ramGb: number | null;
  ramSource: SpecSource;
}

export type RequirementTier = "minimum" | "recommended";
export type SpecComponent = "cpu" | "gpu" | "ram";
export type CheckStatus = "meets" | "below" | "unknown";

export interface ComponentCheck {
  component: SpecComponent;
  status: CheckStatus;
  /** Why an unknown part is unknown: the list names nothing to compare, or the PC's part is not set. */
  unknownReason?: "requirement" | "pc";
  /** The requirement as the store words it; null when it lists none. */
  required: string | null;
}

export interface TierVerdict {
  tier: RequirementTier;
  /** `partial`: nothing is below, but some parts could not be checked. */
  status: "meets" | "partial" | "below" | "unknown";
  checks: ComponentCheck[];
}
