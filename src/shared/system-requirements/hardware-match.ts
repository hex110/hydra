import {
  CPU_MODELS,
  GPU_MODELS,
  type HardwareModel,
} from "./hardware-table.js";

export type HardwareKind = "cpu" | "gpu";

const BRAND_WORDS = new Set([
  "intel",
  "amd",
  "nvidia",
  "geforce",
  "ati",
  "tm",
  "r",
  "cpu",
  "gpu",
  "processor",
  "graphics",
  "corporation",
]);

/** Laptop chips run slower than the desktop chip of the same name. */
export const MOBILE_GPU_FACTOR = 0.8;

/** Lowercase tokens with brands, clock speeds and marketing words removed. */
export const tokenize = (text: string) => {
  const cleaned = text
    .toLowerCase()
    .replace(/\((r|tm)\)|[™®]/g, " ")
    .replace(/@?\s*\d+(?:[.,]\d+)?\s*ghz/g, " ")
    .replace(/\b\d+-core\b/g, " ")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ");
  return cleaned.split(" ").filter((token) => token && !BRAND_WORDS.has(token));
};

const containsSequence = (haystack: string[], needle: string[]) => {
  if (needle.length === 0) return false;
  for (let start = 0; start + needle.length <= haystack.length; start++)
    if (needle.every((token, index) => haystack[start + index] === token))
      return true;
  return false;
};

interface IndexedModel {
  model: HardwareModel;
  tokens: string[];
}

const indexModels = (models: HardwareModel[]): IndexedModel[] =>
  models.map((model) => ({ model, tokens: tokenize(model.name) }));

const INDEX: Record<HardwareKind, IndexedModel[]> = {
  cpu: indexModels(CPU_MODELS),
  gpu: indexModels(GPU_MODELS),
};

export const getHardwareModels = (kind: HardwareKind): HardwareModel[] =>
  kind === "cpu" ? CPU_MODELS : GPU_MODELS;

export const getHardwareModel = (
  kind: HardwareKind,
  id: string | null | undefined
): HardwareModel | null =>
  id
    ? (getHardwareModels(kind).find((model) => model.id === id) ?? null)
    : null;

export interface HardwareMatch {
  model: HardwareModel;
  /** A laptop chip; the score should be scaled by `MOBILE_GPU_FACTOR`. */
  mobile: boolean;
}

/**
 * The table model a free-text name refers to: the one with the most tokens
 * that all appear, in order, in the text ("RTX 3060 Ti" beats "RTX 3060").
 * Null when nothing in the table is named.
 */
export const findHardwareModel = (
  kind: HardwareKind,
  text: string
): HardwareMatch | null => {
  const tokens = tokenize(text);
  const maxQ = tokens.findIndex(
    (token, index) => token === "max" && tokens[index + 1] === "q"
  );
  const mobile =
    kind === "gpu" &&
    (maxQ >= 0 || tokens.includes("laptop") || tokens.includes("mobile"));
  const significant = mobile
    ? tokens.filter(
        (token, index) =>
          token !== "laptop" &&
          token !== "mobile" &&
          !(maxQ >= 0 && (index === maxQ || index === maxQ + 1))
      )
    : tokens;

  let best: IndexedModel | null = null;
  for (const entry of INDEX[kind]) {
    if (!containsSequence(significant, entry.tokens)) continue;
    if (!best || entry.tokens.length > best.tokens.length) best = entry;
  }
  return best ? { model: best.model, mobile } : null;
};

/** Requirement text lists alternatives: "GTX 1060 or RX 580 / Arc A580". */
export const splitAlternatives = (text: string) =>
  text
    .split(/\s*(?:\/|\||;|,|\bor\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);

/**
 * Names a PCI id database gives one device, as a list: "Navi 48 [Radeon RX
 * 9070/9070 XT/9070 GRE]" is three cards.
 */
export const expandPciDeviceName = (deviceName: string): string[] => {
  const bracketed = /\[([^\]]+)\]/.exec(deviceName)?.[1] ?? deviceName;
  const parts = bracketed.split("/").map((part) => part.trim());
  const first = parts[0];
  // "Radeon RX 9070" supplies the words ("Radeon RX") the later parts lack.
  const prefix = first.replace(/\s*\S*\d\S*(\s.*)?$/, "").trim();
  return parts.map((part, index) =>
    index > 0 && /^\d/.test(part) ? `${prefix} ${part}` : part
  );
};
