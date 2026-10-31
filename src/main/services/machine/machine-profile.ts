import fs from "node:fs";
import path from "node:path";

import type { MachineGpu, MachineProfile } from "@types";

import { logger } from "../logger";
import {
  edidSupportsHdr,
  findOffloadGpu,
  gpuVendorFromPciId,
} from "./machine-profile-core";

const DRM_PATH = "/sys/class/drm";
/** Displays come and go (a laptop on a dock); read them again after this. */
const CACHE_MS = 30_000;

let cached: { profile: MachineProfile; at: number } | null = null;

const readText = (filePath: string) => {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return null;
  }
};

const readGpus = (entries: string[]): MachineGpu[] =>
  entries
    .filter((entry) => /^card\d+$/.test(entry))
    .flatMap((card) => {
      const device = path.join(DRM_PATH, card, "device");
      const vendorId = readText(path.join(device, "vendor"));
      if (!vendorId) return [];
      let driver: string | null = null;
      try {
        driver = path.basename(fs.readlinkSync(path.join(device, "driver")));
      } catch {
        // No driver bound.
      }
      return [
        {
          card,
          vendor: gpuVendorFromPciId(vendorId),
          driver,
          bootDisplay: readText(path.join(device, "boot_vga")) === "1",
        },
      ];
    });

const readHdrDisplays = (entries: string[]) =>
  entries
    .filter((entry) => /^card\d+-/.test(entry))
    .filter(
      (output) =>
        readText(path.join(DRM_PATH, output, "status")) === "connected"
    )
    .filter((output) => {
      try {
        return edidSupportsHdr(
          fs.readFileSync(path.join(DRM_PATH, output, "edid"))
        );
      } catch {
        return false;
      }
    })
    .map((output) => output.replace(/^card\d+-/, ""));

const readProfile = (): MachineProfile => {
  if (process.platform !== "linux")
    return {
      gpus: [],
      offloadGpu: null,
      hdrDisplays: [],
      displaysKnown: false,
    };
  try {
    const entries = fs.readdirSync(DRM_PATH);
    const gpus = readGpus(entries);
    return {
      gpus,
      offloadGpu: findOffloadGpu(gpus),
      hdrDisplays: readHdrDisplays(entries),
      displaysKnown: entries.some((entry) => /^card\d+-/.test(entry)),
    };
  } catch (error) {
    logger.warn("Could not read the machine's GPUs and displays", error);
    return {
      gpus: [],
      offloadGpu: null,
      hdrDisplays: [],
      displaysKnown: false,
    };
  }
};

export const getMachineProfile = (): MachineProfile => {
  const now = Date.now();
  if (!cached || now - cached.at > CACHE_MS)
    cached = { profile: readProfile(), at: now };
  return cached.profile;
};

/** True, or unknown: only a machine known to lack HDR displays says no. */
export const mayHaveHdrDisplay = () => {
  const profile = getMachineProfile();
  return !profile.displaysKnown || profile.hdrDisplays.length > 0;
};
