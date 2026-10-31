import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import type { MachineGpu } from "@types";

import {
  edidSupportsHdr,
  findOffloadGpu,
  gpuVendorFromPciId,
} from "./machine-profile-core.ts";

const gpu = (fields: Partial<MachineGpu>): MachineGpu => ({
  card: "card0",
  vendor: "amd",
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
