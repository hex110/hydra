import type {
  CheckStatus,
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

/**
 * The lowest score among the alternatives a requirement names ("or" means the
 * easiest one is enough). Null when none is a model the table knows.
 */
const requiredScore = (kind: "cpu" | "gpu", text: string): number | null => {
  const scores = splitAlternatives(text).flatMap((alternative) => {
    const match = findHardwareModel(kind, alternative);
    if (!match) return [];
    return [match.model.score * (match.mobile ? MOBILE_GPU_FACTOR : 1)];
  });
  return scores.length > 0 ? Math.min(...scores) : null;
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

const checkScore = (
  kind: "cpu" | "gpu",
  userScore: number | null,
  required: string
): CheckStatus => {
  const needed = requiredScore(kind, required);
  if (needed === null || userScore === null) return "unknown";
  return userScore >= needed * SCORE_TOLERANCE ? "meets" : "below";
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
      status: checkScore("cpu", cpu?.score ?? null, parsed.cpu),
      required: parsed.cpu,
    });
  if (parsed.gpu)
    checks.push({
      component: "gpu",
      status: checkScore(
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
      status:
        needed === null || specs.ramGb === null
          ? "unknown"
          : specs.ramGb >= needed
            ? "meets"
            : "below",
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
