import {
  expandPciDeviceName,
  findHardwareModel,
  getHardwareModel,
} from "../../../shared/system-requirements/hardware-match.js";
import type { DetectedSpecs } from "@types";

/** The device's name from a `pci.ids` database, or null when it is not listed. */
export const lookupPciDevice = (
  pciIds: string,
  vendorId: string,
  deviceId: string
): string | null => {
  const vendor = vendorId.replace(/^0x/i, "").toLowerCase();
  const device = deviceId.replace(/^0x/i, "").toLowerCase();
  let inVendor = false;
  for (const line of pciIds.split("\n")) {
    if (line.startsWith("#") || !line.trim()) continue;
    if (!line.startsWith("\t")) {
      if (inVendor) return null;
      inVendor =
        line.startsWith(`${vendor} `) || line.startsWith(`${vendor}\t`);
      continue;
    }
    if (inVendor && !line.startsWith("\t\t")) {
      const [id, ...name] = line.trim().split(/\s+/);
      if (id.toLowerCase() === device) return name.join(" ");
    }
  }
  return null;
};

export interface GpuMatch {
  name: string;
  ids: string[];
  mobile: boolean;
}

/** Every table model a GPU name could mean ("RX 9070/9070 XT" is two). */
export const matchGpuName = (name: string): GpuMatch => {
  const ids: string[] = [];
  let mobile = false;
  for (const candidate of expandPciDeviceName(name)) {
    const match = findHardwareModel("gpu", candidate);
    if (!match) continue;
    mobile ||= match.mobile;
    if (!ids.includes(match.model.id)) ids.push(match.model.id);
  }
  return { name, ids, mobile };
};

/** Of several adapters (an integrated chip and a card), the fastest known one. */
export const pickBestGpu = (names: string[]): GpuMatch | null => {
  const matches = names.map(matchGpuName);
  const score = (match: GpuMatch) =>
    Math.max(
      0,
      ...match.ids.map((id) => getHardwareModel("gpu", id)?.score ?? 0)
    );
  return matches.sort((a, b) => score(b) - score(a))[0] ?? null;
};

export const buildDetectedSpecs = (input: {
  cpuName: string | null;
  gpuNames: string[];
  ramBytes: number;
}): DetectedSpecs => {
  const gpu = pickBestGpu(input.gpuNames);
  return {
    cpuName: input.cpuName,
    cpuId: input.cpuName
      ? (findHardwareModel("cpu", input.cpuName)?.model.id ?? null)
      : null,
    gpuName: gpu?.name ?? null,
    gpuIds: gpu?.ids ?? [],
    gpuMobile: gpu?.mobile ?? false,
    ramGb: input.ramBytes > 0 ? Math.round(input.ramBytes / 1024 ** 3) : null,
  };
};
