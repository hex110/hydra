import type {
  OptiScalerChannel,
  OptiScalerCompatibilityEntry,
  OptiScalerEligibility,
  OptiScalerEligibilityReason,
  OptiScalerProxyDll,
  OptiScalerProxyDllChoice,
  UserPreferences,
} from "@types";
import { parseIniOverrides, type IniOverride } from "./ini-overrides.js";
import { isSameTitle } from "./title-matching.js";

export const OPTISCALER_PROXY_DLLS: OptiScalerProxyDll[] = [
  "dxgi.dll",
  "winmm.dll",
  "version.dll",
  "dbghelp.dll",
  "d3d12.dll",
  "wininet.dll",
  "winhttp.dll",
];

export const DEFAULT_OPTISCALER_PROXY_DLL: OptiScalerProxyDll = "dxgi.dll";

/**
 * Names tried for a game that only renders through Vulkan, best first.
 * OptiScaler loaded as dxgi.dll works as a DirectX hook and never sees such a
 * game's swapchain, so there is no overlay and no upscaling.
 */
export const OPTISCALER_VULKAN_PROXY_DLLS: OptiScalerProxyDll[] = [
  "winmm.dll",
  "dbghelp.dll",
  "version.dll",
];

export const isOptiScalerProxyDll = (
  value: unknown
): value is OptiScalerProxyDll =>
  OPTISCALER_PROXY_DLLS.includes(value as OptiScalerProxyDll);

/**
 * Reads the proxy DLL names a game's page on the OptiScaler wiki lists under
 * "Filename", in the order the page gives them (the first is the preferred
 * one). Names Hydra cannot install, such as `OptiScaler.asi`, are skipped.
 */
export const parseOptiScalerWikiProxyDlls = (
  page: string
): OptiScalerProxyDll[] => {
  const label = /\bFilename\b/i.exec(page);
  if (!label) return [];

  // The value follows the label and ends at the next blank line.
  const value = page
    .slice(label.index + label[0].length)
    .split(/\r?\n\s*\r?\n/)[0];

  const names = [...value.matchAll(/[\w.-]+\.dll/gi)].map((match) =>
    match[0].toLowerCase()
  );
  return [...new Set(names)].filter(isOptiScalerProxyDll);
};

export interface ProxyDllChoiceInput {
  /** Names from the game's wiki page, best first. */
  wikiDlls: OptiScalerProxyDll[];
  /** The game renders through Vulkan and no DirectX version. */
  vulkanOnly: boolean;
  /** Lower-case names of files already in the game folder that are not OptiScaler's. */
  occupied: ReadonlySet<string>;
}

/**
 * Picks the proxy DLL when neither the game nor the settings name one: the
 * wiki's choice, then the Vulkan names for a Vulkan-only game, then dxgi.dll.
 * A name the game folder already has (a crack's winmm.dll, ReShade's dxgi.dll)
 * is skipped, since installing over it would replace that file.
 */
export const chooseOptiScalerProxyDll = ({
  wikiDlls,
  vulkanOnly,
  occupied,
}: ProxyDllChoiceInput): OptiScalerProxyDllChoice => {
  const isFree = (dll: OptiScalerProxyDll) => !occupied.has(dll);

  const wiki = wikiDlls.find(isFree);
  if (wiki) return { proxyDll: wiki, source: "wiki" };

  if (vulkanOnly) {
    const vulkan = OPTISCALER_VULKAN_PROXY_DLLS.find(isFree);
    if (vulkan) return { proxyDll: vulkan, source: "vulkan" };
  }

  const fallback = [
    DEFAULT_OPTISCALER_PROXY_DLL,
    ...OPTISCALER_PROXY_DLLS,
  ].find(isFree);
  // Every name is taken: install over the best candidate, as before.
  return {
    proxyDll: fallback ?? wikiDlls[0] ?? DEFAULT_OPTISCALER_PROXY_DLL,
    source: wikiDlls.length > 0 && !fallback ? "wiki" : "default",
  };
};

/** Libraries whose presence means the game renders through a supported upscaler. */
const UPSCALER_LIBRARY_PATTERNS = [
  /^nvngx_dlss\.dll$/i,
  /^libxess(_dx11)?\.dll$/i,
  /^amd_fidelityfx_(dx12|vk|upscaler_dx12)\.dll$/i,
  /^ffx_fsr2_api_(x64|dx12_x64|vk_x64)\.dll$/i,
  /^ffx_fsr3upscaler_x64\.dll$/i,
  /^sl\.interposer\.dll$/i,
];

export const isUpscalerLibrary = (fileName: string) =>
  UPSCALER_LIBRARY_PATTERNS.some((pattern) => pattern.test(fileName));

const stripMarkdown = (value: string) =>
  value
    .replaceAll(/<br\s*\/?>/gi, " ")
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replaceAll(/[*_`]/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();

const parseStatus = (cell: string) => {
  if (cell.includes("✅")) return "working" as const;
  if (cell.includes("❌")) return "not-working" as const;
  return null;
};

/**
 * Parses the main table of the OptiScaler wiki's Compatibility List page.
 * Rows marked as working on a single OS are left out.
 */
export const parseOptiScalerCompatibilityList = (
  markdown: string
): OptiScalerCompatibilityEntry[] => {
  const lines = markdown.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) =>
    /^\|\s*Game\s*\|\s*Compatibility\s*\|/i.test(line)
  );
  if (headerIndex === -1) return [];

  const entries: OptiScalerCompatibilityEntry[] = [];

  for (const line of lines.slice(headerIndex + 2)) {
    if (/^#{1,3}\s/.test(line)) break;
    if (!line.includes("|")) continue;

    const cells = line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length < 4) continue;

    const [nameCell, statusCell, inputsCell, optiPatcherCell, notesCell] =
      cells;
    const status = parseStatus(statusCell);
    const title = stripMarkdown(nameCell);
    if (!status || !title) continue;

    const slug = /\]\(([^)\s]+)\)/.exec(nameCell)?.[1] ?? null;

    entries.push({
      title,
      status,
      upscalerInputs: stripMarkdown(inputsCell),
      optiPatcherSupported: optiPatcherCell.includes("✨"),
      notes: stripMarkdown(notesCell ?? ""),
      wikiSlug: slug && !/^https?:/i.test(slug) ? slug : null,
    });
  }

  return entries;
};

export const findOptiScalerCompatibilityEntry = (
  entries: OptiScalerCompatibilityEntry[],
  title: string
) => entries.find((entry) => isSameTitle(entry.title, title)) ?? null;

export interface OptiScalerDetectionSettings {
  detectNativeUpscalers: boolean;
  useCompatibilityList: boolean;
}

/**
 * A game qualifies when it ships an upscaler OptiScaler can hook or the
 * OptiScaler wiki lists it as working. Games the wiki lists as not working
 * (almost always because of anti-cheat) never qualify.
 */
export const evaluateOptiScalerEligibility = (
  settings: OptiScalerDetectionSettings,
  upscalerLibraries: string[],
  compatibility: OptiScalerCompatibilityEntry | null
): OptiScalerEligibility => {
  const blocked = compatibility?.status === "not-working";
  const reasons: OptiScalerEligibilityReason[] = [];

  if (settings.detectNativeUpscalers && upscalerLibraries.length > 0) {
    reasons.push("native-upscaler");
  }
  if (settings.useCompatibilityList && compatibility?.status === "working") {
    reasons.push("compatibility-list");
  }

  return {
    eligible: !blocked && reasons.length > 0,
    reasons,
    upscalerLibraries,
    compatibility,
    blocked,
  };
};

/** Compares OptiScaler versions such as "0.9.4", "v0.9.2a" or "nightly-20261017". */
export const compareOptiScalerVersions = (a: string, b: string) =>
  a.replace(/^v/i, "").localeCompare(b.replace(/^v/i, ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });

export interface OptiScalerSettings extends OptiScalerDetectionSettings {
  autoInstall: boolean;
  channel: OptiScalerChannel;
  /** The DLL name chosen in settings, or null to pick one for each game. */
  proxyDll: OptiScalerProxyDll | null;
  installOptiPatcher: boolean;
  iniOverrides: IniOverride[];
}

/** User preferences with OptiScaler's defaults filled in. */
export const resolveOptiScalerSettings = (
  preferences: UserPreferences | null | undefined
): OptiScalerSettings => ({
  autoInstall: preferences?.optiScalerAutoInstall === true,
  channel: preferences?.optiScalerChannel === "nightly" ? "nightly" : "stable",
  proxyDll: isOptiScalerProxyDll(preferences?.optiScalerProxyDll)
    ? preferences.optiScalerProxyDll
    : null,
  detectNativeUpscalers: preferences?.optiScalerDetectNativeUpscalers !== false,
  useCompatibilityList: preferences?.optiScalerUseCompatibilityList !== false,
  installOptiPatcher: preferences?.optiScalerInstallOptiPatcher !== false,
  iniOverrides: parseIniOverrides(preferences?.optiScalerIniOverrides ?? "")
    .overrides,
});
