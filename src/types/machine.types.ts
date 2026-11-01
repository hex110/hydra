export type GpuVendor = "amd" | "nvidia" | "intel" | "other";

export interface MachineGpu {
  /** The DRM card, e.g. `card1`. */
  card: string;
  vendor: GpuVendor;
  /** The PCI device id, e.g. `0x7550`. */
  deviceId: string | null;
  /** The kernel driver, e.g. `amdgpu`, `nvidia`, `i915`. */
  driver: string | null;
  /** Firmware picked it for the boot display; on laptops, the integrated GPU. */
  bootDisplay: boolean;
}

/** What Hydra knows about the machine it runs on, for Auto decisions. */
/**
 * The best upscaler a GPU runs: FSR 4 (RDNA 4), DLSS (NVIDIA), or FSR 3.1 and
 * XeSS (every other GPU). OptiScaler picks the same on its own.
 */
export type GpuUpscalerFit = "fsr4" | "dlss" | "fsr3";

export interface MachineProfile {
  gpus: MachineGpu[];
  /** The GPU games render on by default: the boot display's GPU. */
  gameGpu: MachineGpu | null;
  /** Null when no GPU could be read; Auto then doesn't judge the GPU. */
  upscalerFit: GpuUpscalerFit | null;
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
