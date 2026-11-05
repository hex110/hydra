import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDetectedSpecs,
  lookupPciDevice,
  matchGpuName,
} from "./detect-specs-core.ts";

const PCI_IDS = `# comment
1002  Advanced Micro Devices, Inc. [AMD/ATI]
\t13c0  Granite Ridge [Radeon 610M]
\t7550  Navi 48 [Radeon RX 9070/9070 XT/9070 GRE]
\t\t1002 0001  Subsystem line
10de  NVIDIA Corporation
\t2504  GA106 [GeForce RTX 3060 Lite Hash Rate]
`;

describe("lookupPciDevice", () => {
  it("finds a device under its vendor", () => {
    assert.equal(
      lookupPciDevice(PCI_IDS, "0x1002", "0x7550"),
      "Navi 48 [Radeon RX 9070/9070 XT/9070 GRE]"
    );
    assert.equal(
      lookupPciDevice(PCI_IDS, "10de", "0x2504"),
      "GA106 [GeForce RTX 3060 Lite Hash Rate]"
    );
  });

  it("does not read another vendor's ids or subsystems", () => {
    assert.equal(lookupPciDevice(PCI_IDS, "0x10de", "0x7550"), null);
    assert.equal(lookupPciDevice(PCI_IDS, "0x1002", "0x0001"), null);
    assert.equal(lookupPciDevice(PCI_IDS, "0x8086", "0x7550"), null);
  });
});

describe("matchGpuName", () => {
  it("returns all three cards that share the RX 9070 id", () => {
    const match = matchGpuName("Navi 48 [Radeon RX 9070/9070 XT/9070 GRE]");
    assert.deepEqual(match.ids.sort(), [
      "radeon-rx-9070",
      "radeon-rx-9070-gre",
      "radeon-rx-9070-xt",
    ]);
  });

  it("matches a Windows adapter name", () => {
    assert.deepEqual(matchGpuName("NVIDIA GeForce RTX 4070 SUPER").ids, [
      "geforce-rtx-4070-super",
    ]);
  });
});

describe("buildDetectedSpecs", () => {
  it("picks the fastest adapter and rounds memory", () => {
    const specs = buildDetectedSpecs({
      cpuName: "AMD Ryzen 7 9800X3D 8-Core Processor",
      gpuNames: ["AMD Radeon(TM) Graphics", "NVIDIA GeForce RTX 3060"],
      ramBytes: 15.6 * 1024 ** 3,
    });
    assert.equal(specs.cpuId, "amd-ryzen-7-9800x3d");
    assert.deepEqual(specs.gpuIds, ["geforce-rtx-3060"]);
    assert.equal(specs.ramGb, 16);
  });

  it("leaves what it cannot place empty", () => {
    const specs = buildDetectedSpecs({
      cpuName: "Some Future CPU 9000",
      gpuNames: [],
      ramBytes: 0,
    });
    assert.equal(specs.cpuId, null);
    assert.deepEqual(specs.gpuIds, []);
    assert.equal(specs.ramGb, null);
  });
});
