import type {
  OptiScalerChannel,
  OptiScalerCompatibilityEntry,
  OptiScalerEligibility,
  OptiScalerEligibilityReason,
  OptiScalerProxyDll,
  UserPreferences,
} from "@types";
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

export const isOptiScalerProxyDll = (
  value: unknown
): value is OptiScalerProxyDll =>
  OPTISCALER_PROXY_DLLS.includes(value as OptiScalerProxyDll);

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

export interface IniOverride {
  section: string;
  key: string;
  value: string;
}

export interface ParsedIniOverrides {
  overrides: IniOverride[];
  /** 1-based line numbers that are neither a section, a key=value pair nor a comment. */
  invalidLines: number[];
}

/** Parses an INI fragment such as "[Menu]\nShortcutKey=0x78". */
export const parseIniOverrides = (text: string): ParsedIniOverrides => {
  const overrides: IniOverride[] = [];
  const invalidLines: number[] = [];
  let section: string | null = null;

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) return;

    const sectionMatch = /^\[([^\]]+)\]$/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      return;
    }

    const separator = line.indexOf("=");
    const key = separator > 0 ? line.slice(0, separator).trim() : "";
    if (!section || !key) {
      invalidLines.push(index + 1);
      return;
    }

    overrides.push({ section, key, value: line.slice(separator + 1).trim() });
  });

  return { overrides, invalidLines };
};

/**
 * Sets each override in an INI document, replacing the key inside its
 * section when present and adding it (and the section) otherwise. Comments
 * and layout are preserved.
 */
export const applyIniOverrides = (
  document: string,
  overrides: IniOverride[]
): string => {
  const newline = document.includes("\r\n") ? "\r\n" : "\n";
  const lines = document.split(/\r?\n/);

  for (const { section, key, value } of overrides) {
    const sectionStart = lines.findIndex(
      (line) => line.trim().toLowerCase() === `[${section.toLowerCase()}]`
    );

    if (sectionStart === -1) {
      if (lines.length > 0 && lines[lines.length - 1].trim() !== "") {
        lines.push("");
      }
      lines.push(`[${section}]`, `${key}=${value}`);
      continue;
    }

    let sectionEnd = lines.length;
    for (let index = sectionStart + 1; index < lines.length; index++) {
      if (/^\s*\[[^\]]+\]\s*$/.test(lines[index])) {
        sectionEnd = index;
        break;
      }
    }

    const keyPattern = new RegExp(
      `^\\s*${key.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=`,
      "i"
    );
    const keyIndex = lines
      .slice(sectionStart + 1, sectionEnd)
      .findIndex((line) => keyPattern.test(line));

    if (keyIndex !== -1) {
      lines[sectionStart + 1 + keyIndex] = `${key}=${value}`;
      continue;
    }

    let insertAt = sectionEnd;
    while (insertAt > sectionStart + 1 && lines[insertAt - 1].trim() === "") {
      insertAt--;
    }
    lines.splice(insertAt, 0, `${key}=${value}`);
  }

  return lines.join(newline);
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
  proxyDll: OptiScalerProxyDll;
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
    : DEFAULT_OPTISCALER_PROXY_DLL,
  detectNativeUpscalers: preferences?.optiScalerDetectNativeUpscalers !== false,
  useCompatibilityList: preferences?.optiScalerUseCompatibilityList !== false,
  installOptiPatcher: preferences?.optiScalerInstallOptiPatcher !== false,
  iniOverrides: parseIniOverrides(preferences?.optiScalerIniOverrides ?? "")
    .overrides,
});

/** The WINEDLLOVERRIDES entry that makes Wine load OptiScaler's proxy DLL. */
export const getOptiScalerDllOverride = (proxyDll: OptiScalerProxyDll) =>
  `${proxyDll.replace(/\.dll$/i, "")}=n,b`;
