import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DetectedSpecs } from "@types";

import {
  expandPciDeviceName,
  findHardwareModel,
  splitAlternatives,
} from "./hardware-match.js";
import {
  compareSpecs,
  genericCpuScore,
  genericGpuScore,
  parseMemoryGb,
  parseRequirements,
  resolveSpecs,
} from "./requirements.js";

const html = (lines: Record<string, string>) =>
  `<strong>Minimum:</strong><br><ul class="bb_ul"><li><strong>Requires a 64-bit processor and operating system</strong><br></li>` +
  Object.entries(lines)
    .map(([label, value]) => `<li><strong>${label}:</strong> ${value}<br></li>`)
    .join("") +
  "</ul>";

const detected = (fields: Partial<DetectedSpecs>): DetectedSpecs => ({
  cpuName: null,
  cpuId: null,
  gpuName: null,
  gpuIds: [],
  gpuMobile: false,
  ramGb: null,
  ...fields,
});

describe("findHardwareModel", () => {
  it("prefers the longest model name", () => {
    assert.equal(
      findHardwareModel("gpu", "RTX 3060 Ti")?.model.id,
      "geforce-rtx-3060-ti"
    );
    assert.equal(
      findHardwareModel("gpu", "NVIDIA GeForce RTX 3060")?.model.id,
      "geforce-rtx-3060"
    );
    assert.equal(
      findHardwareModel("gpu", "RTX 4070 Ti Super 16GB")?.model.id,
      "geforce-rtx-4070-ti-super"
    );
  });

  it("reads the spellings stores and drivers use", () => {
    assert.equal(
      findHardwareModel("gpu", "GTX1060")?.model.id,
      "geforce-gtx-1060"
    );
    assert.equal(
      findHardwareModel("gpu", "AMD Radeon™ RX 580 8GB")?.model.id,
      "radeon-rx-580"
    );
    assert.equal(
      findHardwareModel("gpu", "GeForce GTX 1060 3GB")?.model.id,
      "geforce-gtx-1060-3gb"
    );
    assert.equal(
      findHardwareModel("cpu", "Intel(R) Core(TM) i5-8400 CPU @ 2.80GHz")?.model
        .id,
      "intel-core-i5-8400"
    );
    assert.equal(
      findHardwareModel("cpu", "AMD Ryzen 7 9800X3D 8-Core Processor")?.model
        .id,
      "amd-ryzen-7-9800x3d"
    );
    assert.equal(
      findHardwareModel("cpu", "Core 2 Quad Q9550")?.model.id,
      "intel-core-2-quad-q9550"
    );
  });

  it("does not mistake one number for another", () => {
    assert.equal(findHardwareModel("gpu", "RX 5800"), null);
    assert.equal(findHardwareModel("cpu", "Quad-core 3.0 GHz"), null);
  });

  it("flags laptop GPUs", () => {
    const match = findHardwareModel(
      "gpu",
      "NVIDIA GeForce RTX 3060 Laptop GPU"
    );
    assert.equal(match?.model.id, "geforce-rtx-3060");
    assert.equal(match?.mobile, true);
    assert.equal(findHardwareModel("gpu", "RTX 3060 Max-Q")?.mobile, true);
  });
});

describe("expandPciDeviceName", () => {
  it("lists the cards that share a PCI id", () => {
    assert.deepEqual(
      expandPciDeviceName("Navi 48 [Radeon RX 9070/9070 XT/9070 GRE]"),
      ["Radeon RX 9070", "Radeon RX 9070 XT", "Radeon RX 9070 GRE"]
    );
    assert.deepEqual(expandPciDeviceName("GA104 [GeForce RTX 3070]"), [
      "GeForce RTX 3070",
    ]);
  });
});

describe("splitAlternatives", () => {
  it("splits on slashes, commas and 'or'", () => {
    assert.deepEqual(
      splitAlternatives("NVIDIA GTX 1060 6GB or AMD RX 580 / Arc A580"),
      ["NVIDIA GTX 1060 6GB", "AMD RX 580", "Arc A580"]
    );
  });
});

describe("parseRequirements", () => {
  it("reads Steam's list", () => {
    const parsed = parseRequirements(
      html({
        "OS *": "Windows 10",
        Processor: "Intel Core i5-8400 &amp; AMD Ryzen 5 2600",
        Memory: "8 GB RAM",
        Graphics: "NVIDIA GTX 1060 6GB",
        Storage: "50 GB available space",
      })
    );
    assert.equal(parsed.cpu, "Intel Core i5-8400 & AMD Ryzen 5 2600");
    assert.equal(parsed.ram, "8 GB RAM");
    assert.equal(parsed.gpu, "NVIDIA GTX 1060 6GB");
    assert.equal(parsed.storage, "50 GB available space");
  });

  it("copes with empty and missing input", () => {
    assert.deepEqual(parseRequirements(undefined), {});
    assert.deepEqual(parseRequirements(""), {});
  });
});

describe("parseMemoryGb", () => {
  it("reads GB and MB", () => {
    assert.equal(parseMemoryGb("8 GB RAM"), 8);
    assert.equal(parseMemoryGb("8192 MB RAM"), 8);
    assert.equal(parseMemoryGb("Lots"), null);
  });
});

describe("compareSpecs", () => {
  const specs = resolveSpecs(
    detected({
      cpuId: "amd-ryzen-7-9800x3d",
      gpuIds: ["radeon-rx-9070-xt"],
      ramGb: 32,
    }),
    undefined
  );
  const requirements = html({
    Processor: "Intel Core i5-8400 / AMD Ryzen 5 2600",
    Graphics: "NVIDIA GTX 1060 6GB or AMD RX 580",
    Memory: "8 GB RAM",
  });

  it("meets a requirement the PC is well above", () => {
    const verdict = compareSpecs(specs, requirements, "minimum");
    assert.equal(verdict.status, "meets");
    assert.deepEqual(
      verdict.checks.map((check) => check.status),
      ["meets", "meets", "meets"]
    );
  });

  it("names the part that falls short", () => {
    const weak = resolveSpecs(
      detected({
        cpuId: "intel-core-i5-8400",
        gpuIds: ["geforce-gtx-960"],
        ramGb: 8,
      }),
      undefined
    );
    const verdict = compareSpecs(
      weak,
      html({
        Processor: "Intel Core i7-8700K",
        Graphics: "NVIDIA GTX 1060",
        Memory: "8 GB RAM",
      }),
      "recommended"
    );
    assert.equal(verdict.status, "below");
    assert.deepEqual(
      verdict.checks.map((check) => check.status),
      ["below", "below", "meets"]
    );
  });

  it("does not guess when a part cannot be read", () => {
    const verdict = compareSpecs(
      specs,
      html({
        Processor: "A reasonably fast processor",
        Graphics: "A modern graphics card",
        Memory: "8 GB",
      }),
      "minimum"
    );
    assert.equal(verdict.status, "partial");
    const none = compareSpecs(
      specs,
      html({ Graphics: "A modern graphics card" }),
      "minimum"
    );
    assert.equal(none.status, "unknown");
  });

  it("is unknown when the PC's part is unknown", () => {
    const verdict = compareSpecs(
      resolveSpecs(detected({ ramGb: 16 }), undefined),
      html({ Processor: "Intel Core i5-8400" }),
      "minimum"
    );
    assert.equal(verdict.status, "unknown");
  });

  it("has no checks for a tier the store leaves empty", () => {
    const verdict = compareSpecs(specs, "", "recommended");
    assert.deepEqual(verdict.checks, []);
    assert.equal(verdict.status, "unknown");
  });
});

describe("resolveSpecs", () => {
  it("assumes the weakest when a PCI id covers several GPUs", () => {
    const resolved = resolveSpecs(
      detected({
        gpuIds: ["radeon-rx-9070-xt", "radeon-rx-9070", "radeon-rx-9070-gre"],
      }),
      undefined
    );
    assert.equal(resolved.gpuId, "radeon-rx-9070-gre");
    assert.equal(resolved.gpuAmbiguous, true);
  });

  it("lets the user's edit win and ignores unknown ids", () => {
    const resolved = resolveSpecs(
      detected({
        gpuIds: ["radeon-rx-9070", "radeon-rx-9070-xt"],
        cpuId: "amd-ryzen-7-9800x3d",
        ramGb: 15,
      }),
      { gpuId: "radeon-rx-9070-xt", cpuId: "not-a-cpu", ramGb: 16 }
    );
    assert.equal(resolved.gpuId, "radeon-rx-9070-xt");
    assert.equal(resolved.gpuSource, "edited");
    assert.equal(resolved.gpuAmbiguous, false);
    assert.equal(resolved.cpuId, "amd-ryzen-7-9800x3d");
    assert.equal(resolved.cpuSource, "detected");
    assert.equal(resolved.ramGb, 16);
    assert.equal(resolved.ramSource, "edited");
  });
});

describe("requirements that name no model", () => {
  const strong = resolveSpecs(
    detected({
      cpuId: "amd-ryzen-7-9800x3d",
      gpuIds: ["radeon-rx-9070-xt"],
      ramGb: 60,
    }),
    undefined
  );
  const weak = resolveSpecs(
    detected({
      cpuId: "intel-core-2-duo-e6600",
      gpuIds: ["radeon-hd-5770"],
      ramGb: 2,
    }),
    undefined
  );
  const minimum = html({
    Processor: "Dual-core 2.0 GHz",
    Memory: "4 GB RAM",
    Graphics: "DirectX 12 or Vulkan compatible, 1 GB VRAM",
  });
  const recommended = html({
    Processor: "Quad-core 3.0 GHz",
    Memory: "8 GB RAM",
    Graphics: "DirectX 12 or Vulkan compatible, 2 GB VRAM",
  });

  it("checks core counts, clocks and VRAM against typical hardware", () => {
    assert.equal(compareSpecs(strong, minimum, "minimum").status, "meets");
    assert.equal(
      compareSpecs(strong, recommended, "recommended").status,
      "meets"
    );
  });

  it("still fails a PC that is below them", () => {
    const verdict = compareSpecs(weak, recommended, "recommended");
    assert.equal(verdict.status, "below");
    assert.deepEqual(
      verdict.checks.map((check) => check.status),
      ["below", "below", "below"]
    );
  });

  it("scores the generic wordings", () => {
    assert.equal(genericCpuScore("Dual-core 2.0 GHz"), 20);
    assert.equal(genericCpuScore("Quad core 3.4 GHz"), 45);
    assert.equal(genericCpuScore("8 cores"), 110);
    assert.equal(genericCpuScore("A fast processor"), null);
    assert.equal(genericGpuScore("DirectX 11 compatible"), 20);
    assert.equal(genericGpuScore("DirectX 11, 4 GB video memory"), 55);
    assert.equal(genericGpuScore("OpenGL 3.3"), 8);
    assert.equal(genericGpuScore("Any graphics card"), null);
  });

  it("says whether the list or the PC is the unknown side", () => {
    const vague = compareSpecs(
      strong,
      html({ Processor: "A fast processor" }),
      "minimum"
    );
    assert.equal(vague.checks[0].unknownReason, "requirement");
    const noPc = compareSpecs(
      resolveSpecs(detected({}), undefined),
      html({ Processor: "Intel Core i5-8400", Memory: "8 GB" }),
      "minimum"
    );
    assert.deepEqual(
      noPc.checks.map((check) => check.unknownReason),
      ["pc", "pc"]
    );
  });
});
