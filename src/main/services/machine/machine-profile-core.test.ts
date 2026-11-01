import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import type { MachineGpu } from "@types";

import {
  edidSupportsHdr,
  findGameGpu,
  findOffloadGpu,
  gpuUpscalerFit,
  gpuVendorFromPciId,
  optiScalerSuitsGpu,
} from "./machine-profile-core.ts";

const gpu = (fields: Partial<MachineGpu>): MachineGpu => ({
  card: "card0",
  vendor: "amd",
  deviceId: null,
  driver: "amdgpu",
  bootDisplay: false,
  ...fields,
});

describe("edidSupportsHdr", () => {
  it("finds HDR in a real HDR monitor's EDID (LG 34GS95QE)", () => {
    const edid = fs.readFileSync(
      path.join(import.meta.dirname, "lg-34gs95qe.edid.bin")
    );
    assert.equal(edidSupportsHdr(edid), true);
  });

  it("says no when the HDR block lists only SDR", () => {
    const edid = fs.readFileSync(
      path.join(import.meta.dirname, "lg-34gs95qe.edid.bin")
    );
    const sdrOnly = Uint8Array.from(edid);
    // The HDR static metadata block's EOTF byte: keep only traditional SDR.
    const block = 128;
    for (let index = block + 4; index < block + sdrOnly[block + 2]; ) {
      const length = sdrOnly[index] & 0x1f;
      if (sdrOnly[index] >> 5 === 7 && sdrOnly[index + 1] === 6)
        sdrOnly[index + 2] = 0x01;
      index += 1 + length;
    }
    assert.equal(edidSupportsHdr(sdrOnly), false);
  });

  it("says no for a base block without extensions", () => {
    assert.equal(edidSupportsHdr(new Uint8Array(128)), false);
  });
});

describe("findOffloadGpu", () => {
  it("finds the NVIDIA chip next to an Intel boot GPU (hybrid laptop)", () => {
    const nvidia = gpu({ card: "card0", vendor: "nvidia", driver: "nvidia" });
    assert.equal(
      findOffloadGpu([
        nvidia,
        gpu({
          card: "card1",
          vendor: "intel",
          driver: "i915",
          bootDisplay: true,
        }),
      ]),
      nvidia
    );
  });

  it("offloads nothing on a desktop whose discrete card is the boot GPU", () => {
    assert.equal(
      findOffloadGpu([
        gpu({ card: "card0" }),
        gpu({ card: "card1", bootDisplay: true }),
      ]),
      null
    );
  });

  it("maps PCI vendor ids", () => {
    assert.equal(gpuVendorFromPciId("0x10de\n"), "nvidia");
    assert.equal(gpuVendorFromPciId("0x1234"), "other");
  });
});

describe("gpuUpscalerFit", () => {
  it("gives RDNA 4 FSR 4 (RX 9070, Navi 48)", () => {
    assert.equal(gpuUpscalerFit(gpu({ deviceId: "0x7550" })), "fsr4");
  });

  it("gives older AMD and Intel FSR 3", () => {
    assert.equal(gpuUpscalerFit(gpu({ deviceId: "0x744c" })), "fsr3");
    assert.equal(
      gpuUpscalerFit(gpu({ vendor: "intel", deviceId: "0x46a8" })),
      "fsr3"
    );
  });

  it("gives NVIDIA DLSS, and knows nothing without a GPU", () => {
    assert.equal(gpuUpscalerFit(gpu({ vendor: "nvidia" })), "dlss");
    assert.equal(gpuUpscalerFit(null), null);
  });
});

describe("findGameGpu", () => {
  it("picks the boot display's GPU over the integrated one", () => {
    const discrete = gpu({ card: "card1", bootDisplay: true });
    assert.equal(findGameGpu([gpu({}), discrete]), discrete);
  });

  it("takes a lone GPU without a boot flag, and no guess among several", () => {
    const only = gpu({});
    assert.equal(findGameGpu([only]), only);
    assert.equal(findGameGpu([gpu({}), gpu({ card: "card1" })]), null);
  });
});

describe("optiScalerSuitsGpu", () => {
  const dlss = ["bin/nvngx_dlss.dll"];
  const fsr = ["amd_fidelityfx_dx12.dll"];

  it("installs on RDNA 4 for any upscaler", () => {
    assert.equal(optiScalerSuitsGpu("fsr4", fsr), true);
  });

  it("leaves NVIDIA on the game's DLSS", () => {
    assert.equal(optiScalerSuitsGpu("dlss", dlss), false);
  });

  it("helps other GPUs only in DLSS-only games", () => {
    assert.equal(optiScalerSuitsGpu("fsr3", dlss), true);
    assert.equal(optiScalerSuitsGpu("fsr3", [...dlss, ...fsr]), false);
    assert.equal(optiScalerSuitsGpu("fsr3", []), false);
  });

  it("doesn't judge an unknown GPU", () => {
    assert.equal(optiScalerSuitsGpu(null, fsr), true);
  });
});
