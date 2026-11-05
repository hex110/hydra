import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { promisify } from "node:util";

import type { DetectedSpecs, GpuVendor } from "@types";

import { logger } from "../logger";
import { getMachineProfile } from "../machine/machine-profile";
import { buildDetectedSpecs, lookupPciDevice } from "./detect-specs-core";

const execFileAsync = promisify(execFile);

const PCI_IDS_PATHS = [
  "/usr/share/hwdata/pci.ids",
  "/usr/share/misc/pci.ids",
  "/usr/share/pci.ids",
];

const VENDOR_IDS: Record<GpuVendor, string | null> = {
  amd: "1002",
  nvidia: "10de",
  intel: "8086",
  other: null,
};

const readPciIds = () => {
  for (const file of PCI_IDS_PATHS) {
    try {
      return fs.readFileSync(file, "utf8");
    } catch {
      // Try the next location.
    }
  }
  return null;
};

const linuxGpuNames = (): string[] => {
  const gpu = getMachineProfile().gameGpu;
  const vendorId = gpu ? VENDOR_IDS[gpu.vendor] : null;
  if (!gpu?.deviceId || !vendorId) return [];
  const pciIds = readPciIds();
  const name = pciIds && lookupPciDevice(pciIds, vendorId, gpu.deviceId);
  return name ? [name] : [];
};

const windowsGpuNames = async (): Promise<string[]> => {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name",
    ],
    { timeout: 10_000, windowsHide: true }
  );
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
};

const readGpuNames = async (): Promise<string[]> => {
  try {
    if (process.platform === "linux") return linuxGpuNames();
    if (process.platform === "win32") return await windowsGpuNames();
  } catch (error) {
    logger.warn("Could not read the GPU's name", error);
  }
  return [];
};

let cached: Promise<DetectedSpecs> | null = null;

/** What this machine's CPU, GPU and memory are; read once per run. */
export const getDetectedSpecs = (): Promise<DetectedSpecs> => {
  cached ??= readGpuNames().then((gpuNames) =>
    buildDetectedSpecs({
      cpuName: os.cpus()[0]?.model?.trim() || null,
      gpuNames,
      ramBytes: os.totalmem(),
    })
  );
  return cached;
};
