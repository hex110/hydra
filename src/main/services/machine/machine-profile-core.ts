import type { GpuVendor, MachineGpu } from "@types";

const EDID_BLOCK = 128;
const CTA_EXTENSION_TAG = 0x02;
const EXTENDED_DATA_BLOCK = 7;
const HDR_STATIC_METADATA = 6;
const EOTF_SMPTE_ST2084 = 1 << 2;

/**
 * Whether an EDID advertises HDR: a CTA-861 extension with an HDR static
 * metadata block that lists the SMPTE ST 2084 (PQ) transfer function.
 */
export const edidSupportsHdr = (edid: Uint8Array) => {
  for (let offset = EDID_BLOCK; offset + EDID_BLOCK <= edid.length; ) {
    const block = edid.subarray(offset, offset + EDID_BLOCK);
    offset += EDID_BLOCK;
    if (block[0] !== CTA_EXTENSION_TAG) continue;

    // Data blocks run from byte 4 up to the detailed timings at byte 2's value.
    const end = Math.min(block[2], EDID_BLOCK);
    for (let index = 4; index < end; ) {
      const header = block[index];
      const tag = header >> 5;
      const length = header & 0x1f;
      if (
        tag === EXTENDED_DATA_BLOCK &&
        length >= 2 &&
        block[index + 1] === HDR_STATIC_METADATA &&
        (block[index + 2] & EOTF_SMPTE_ST2084) !== 0
      )
        return true;
      index += 1 + length;
    }
  }
  return false;
};

const VENDOR_IDS: Record<string, GpuVendor> = {
  "0x1002": "amd",
  "0x10de": "nvidia",
  "0x8086": "intel",
};

export const gpuVendorFromPciId = (vendorId: string): GpuVendor =>
  VENDOR_IDS[vendorId.trim().toLowerCase()] ?? "other";

/**
 * The GPU games would not use by default: on a machine with two GPUs where
 * one drives the boot display and the other is NVIDIA or AMD. Two AMD GPUs on
 * a desktop (a discrete card next to the CPU's integrated one) have the
 * discrete card as boot display, so nothing is offloaded.
 */
export const findOffloadGpu = (gpus: MachineGpu[]): MachineGpu | null => {
  const boot = gpus.find((gpu) => gpu.bootDisplay);
  if (!boot || gpus.length < 2) return null;
  if (boot.vendor !== "intel" && boot.vendor !== "amd") return null;
  return (
    gpus.find(
      (gpu) =>
        !gpu.bootDisplay &&
        (gpu.vendor === "nvidia" ||
          (gpu.vendor === "amd" && boot.vendor === "intel"))
    ) ?? null
  );
};
