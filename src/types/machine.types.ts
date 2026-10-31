export type GpuVendor = "amd" | "nvidia" | "intel" | "other";

export interface MachineGpu {
  /** The DRM card, e.g. `card1`. */
  card: string;
  vendor: GpuVendor;
  /** The kernel driver, e.g. `amdgpu`, `nvidia`, `i915`. */
  driver: string | null;
  /** Firmware picked it for the boot display; on laptops, the integrated GPU. */
  bootDisplay: boolean;
}

/** What Hydra knows about the machine it runs on, for Auto decisions. */
export interface MachineProfile {
  gpus: MachineGpu[];
  /**
   * A second GPU that renders but has no display of its own (a hybrid laptop's
   * NVIDIA or AMD chip). Games run on the boot GPU unless told otherwise.
   */
  offloadGpu: MachineGpu | null;
  /** Connected outputs whose EDID says they accept HDR (SMPTE ST 2084). */
  hdrDisplays: string[];
  /** False when the outputs could not be read; Auto then doesn't judge HDR. */
  displaysKnown: boolean;
}
