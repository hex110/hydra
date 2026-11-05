import type {
  ComponentCheck,
  DetectedSpecs,
  RequirementTier,
  ResolvedSpecs,
  SpecComponent,
  SystemSpecsOverrides,
  TierVerdict,
} from "@types";

import {
  findHardwareModel,
  getHardwareModel,
  MOBILE_GPU_FACTOR,
  splitAlternatives,
} from "./hardware-match.js";

/** The scores are approximate, so a part a little under the line still passes. */
export const SCORE_TOLERANCE = 0.9;

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  reg: "®",
  trade: "™",
};

const htmlToLines = (html: string) =>
  html
    .replace(/<\s*(br|\/li|\/p|li|ul|\/ul)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code))
    )
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name] ?? match)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

const COMPONENT_LABELS: [SpecComponent | "storage", RegExp][] = [
  ["cpu", /^(processor|cpu)\b/],
  ["gpu", /^(graphics|video card|gpu|video|graphic card)\b/],
  ["ram", /^(memory|ram|system memory)\b/],
  ["storage", /^(storage|hard drive|hard disk|hdd|disk space|disk)\b/],
];

export type ParsedRequirements = Partial<
  Record<SpecComponent | "storage", string>
>;

/** Reads Steam's requirement HTML ("<li><strong>Processor:</strong> …") into the lines that can be checked. */
export const parseRequirements = (
  html: string | null | undefined
): ParsedRequirements => {
  const result: ParsedRequirements = {};
  for (const line of htmlToLines(html ?? "")) {
    const colon = line.indexOf(":");
    if (colon <= 0 || colon > 40) continue;
    const label = line.slice(0, colon).toLowerCase().replace(/[*]/g, "").trim();
    const value = line.slice(colon + 1).trim();
    if (!value) continue;
    const component = COMPONENT_LABELS.find(([, pattern]) =>
      pattern.test(label)
    )?.[0];
    if (component && !result[component]) result[component] = value;
  }
  return result;
};

/** The memory a requirement asks for, in GB ("8 GB RAM", "8192 MB"). */
export const parseMemoryGb = (text: string): number | null => {
  const match = /(\d+(?:[.,]\d+)?)\s*(gb|mb|g)\b/i.exec(text);
  if (!match) return null;
  const amount = Number(match[1].replace(",", "."));
  return match[2].toLowerCase() === "mb" ? amount / 1024 : amount;
};

const CORE_WORDS: Record<string, number> = {
  single: 1,
  dual: 2,
  triple: 3,
  quad: 4,
  hexa: 6,
  six: 6,
  octa: 8,
  eight: 8,
};

/**
 * What a requirement that names no model asks of a CPU ("Quad-core 3.0 GHz"),
 * as the score of a typical chip of that class. Null when it states neither
 * a core count nor a clock speed.
 */
export const genericCpuScore = (text: string): number | null => {
  const coreMatch =
    /\b(single|dual|triple|quad|hexa|six|octa|eight|\d+)[\s-]*cores?\b/i.exec(
      text
    );
  const cores = coreMatch
    ? (CORE_WORDS[coreMatch[1].toLowerCase()] ?? Number(coreMatch[1]))
    : null;
  const ghzMatch = /(\d+(?:[.,]\d+)?)\s*ghz/i.exec(text);
  const ghz = ghzMatch ? Number(ghzMatch[1].replace(",", ".")) : null;

  const byCores =
    cores === null
      ? null
      : cores <= 2
        ? 20
        : cores <= 4
          ? 45
          : cores <= 6
            ? 85
            : 110;
  const byClock = ghz === null ? null : ghz <= 2.5 ? 20 : ghz <= 3.2 ? 35 : 45;
  if (byCores === null && byClock === null) return null;
  return Math.max(byCores ?? 0, byClock ?? 0);
};

const VRAM_SCORES: [number, number][] = [
  [1, 15],
  [2, 30],
  [3, 45],
  [4, 55],
  [6, 90],
  [8, 100],
  [12, 150],
];

const apiScore = (text: string): number | null => {
  const scores: number[] = [];
  const directx = /directx\s*(?:version\s*)?(\d+)/i.exec(text);
  if (directx) {
    const level = Number(directx[1]);
    scores.push(level >= 12 ? 28 : level === 11 ? 20 : level === 10 ? 8 : 5);
  }
  if (/vulkan/i.test(text)) scores.push(28);
  const opengl = /opengl\s*(\d+(?:\.\d+)?)/i.exec(text);
  if (opengl) {
    const version = Number(opengl[1]);
    scores.push(version >= 4.5 ? 28 : version >= 4 ? 18 : version >= 3 ? 8 : 5);
  }
  // "DirectX 12 or Vulkan": either API is enough.
  return scores.length > 0 ? Math.min(...scores) : null;
};

/**
 * What a requirement that names no model asks of a GPU ("DirectX 12 or Vulkan
 * compatible, 2 GB VRAM"), as the score of a typical card of that class.
 */
export const genericGpuScore = (text: string): number | null => {
  const vramMatch =
    /(\d+(?:[.,]\d+)?)\s*(gb|mb)\s*(?:of\s+)?(?:dedicated\s+)?(?:vram|video\s+memory|video\s+ram)/i.exec(
      text
    );
  let byVram: number | null = null;
  if (vramMatch) {
    const amount = Number(vramMatch[1].replace(",", "."));
    const gb = vramMatch[2].toLowerCase() === "mb" ? amount / 1024 : amount;
    byVram = VRAM_SCORES.find(([limit]) => gb <= limit)?.[1] ?? 200;
  }
  const byApi = apiScore(text);
  if (byVram === null && byApi === null) return null;
  return Math.max(byVram ?? 0, byApi ?? 0);
};

/**
 * What a requirement asks for, as a score. The lowest among the models it
 * names ("or" means the easiest one is enough); failing that, a typical chip
 * of the class it describes. Null when it is neither.
 */
const requiredScore = (kind: "cpu" | "gpu", text: string): number | null => {
  const scores = splitAlternatives(text).flatMap((alternative) => {
    const match = findHardwareModel(kind, alternative);
    if (!match) return [];
    return [match.model.score * (match.mobile ? MOBILE_GPU_FACTOR : 1)];
  });
  if (scores.length > 0) return Math.min(...scores);
  return kind === "cpu" ? genericCpuScore(text) : genericGpuScore(text);
};

/** Detected values with the user's edits on top. */
export const resolveSpecs = (
  detected: DetectedSpecs | null,
  overrides: SystemSpecsOverrides | undefined
): ResolvedSpecs => {
  const gpuEdited = !!getHardwareModel("gpu", overrides?.gpuId);
  const candidates = (detected?.gpuIds ?? [])
    .map((id) => getHardwareModel("gpu", id))
    .filter((model) => model !== null);
  const guess = candidates.sort((a, b) => a.score - b.score)[0] ?? null;

  return {
    cpuId: getHardwareModel("cpu", overrides?.cpuId)
      ? (overrides?.cpuId ?? null)
      : (detected?.cpuId ?? null),
    cpuSource: getHardwareModel("cpu", overrides?.cpuId)
      ? "edited"
      : "detected",
    gpuId: gpuEdited ? (overrides?.gpuId ?? null) : (guess?.id ?? null),
    gpuSource: gpuEdited ? "edited" : "detected",
    gpuAmbiguous: !gpuEdited && candidates.length > 1,
    gpuMobile: !gpuEdited && !!detected?.gpuMobile,
    ramGb: overrides?.ramGb ?? detected?.ramGb ?? null,
    ramSource: overrides?.ramGb ? "edited" : "detected",
  };
};

type Outcome = Pick<ComponentCheck, "status" | "unknownReason">;

const checkScore = (
  kind: "cpu" | "gpu",
  userScore: number | null,
  required: string
): Outcome => {
  const needed = requiredScore(kind, required);
  if (needed === null)
    return { status: "unknown", unknownReason: "requirement" };
  if (userScore === null) return { status: "unknown", unknownReason: "pc" };
  return {
    status: userScore >= needed * SCORE_TOLERANCE ? "meets" : "below",
  };
};

/** Whether the PC meets one tier of a game's requirements, part by part. */
export const compareSpecs = (
  specs: ResolvedSpecs,
  html: string | null | undefined,
  tier: RequirementTier
): TierVerdict => {
  const parsed = parseRequirements(html);
  const checks: ComponentCheck[] = [];

  const cpu = getHardwareModel("cpu", specs.cpuId);
  const gpu = getHardwareModel("gpu", specs.gpuId);

  if (parsed.cpu)
    checks.push({
      component: "cpu",
      ...checkScore("cpu", cpu?.score ?? null, parsed.cpu),
      required: parsed.cpu,
    });
  if (parsed.gpu)
    checks.push({
      component: "gpu",
      ...checkScore(
        "gpu",
        gpu ? gpu.score * (specs.gpuMobile ? MOBILE_GPU_FACTOR : 1) : null,
        parsed.gpu
      ),
      required: parsed.gpu,
    });
  if (parsed.ram) {
    const needed = parseMemoryGb(parsed.ram);
    checks.push({
      component: "ram",
      ...(needed === null
        ? ({ status: "unknown", unknownReason: "requirement" } as const)
        : specs.ramGb === null
          ? ({ status: "unknown", unknownReason: "pc" } as const)
          : { status: specs.ramGb >= needed ? "meets" : "below" }),
      required: parsed.ram,
    });
  }

  const statuses = checks.map((check) => check.status);
  const status: TierVerdict["status"] = statuses.includes("below")
    ? "below"
    : statuses.every((value) => value === "unknown")
      ? "unknown"
      : statuses.includes("unknown")
        ? "partial"
        : "meets";
  return { tier, status, checks };
};
