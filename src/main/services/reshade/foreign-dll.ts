import fs from "node:fs";
import path from "node:path";
import { findPatternsInFile } from "../graphics/file-scan.js";

/** Tools that install themselves as a proxy DLL (dxgi.dll, d3d9.dll, ...). */
export type ProxyDllKind =
  | "optiscaler"
  | "reshade"
  | "special-k"
  | "enb"
  | "dxvk"
  | "unknown";

const MAX_SCANNED_BYTES = 128 * 1024 * 1024;

/**
 * Text each tool leaves in its DLL, in the order to test: OptiScaler loads
 * ReShade and mentions Special K and DXVK, so it must be tested first, and
 * ReShade's author string only occurs in ReShade itself.
 */
const MARKERS: { kind: Exclude<ProxyDllKind, "unknown">; text: string }[] = [
  { kind: "optiscaler", text: "optiscaler" },
  { kind: "reshade", text: "crosire" },
  { kind: "special-k", text: "specialk" },
  { kind: "enb", text: "enbseries" },
  { kind: "dxvk", text: "dxvk" },
];

/** Each marker as plain text and as UTF-16, which Windows programs often use. */
const PATTERNS = MARKERS.flatMap(({ kind, text }) => [
  { kind, bytes: Buffer.from(text, "latin1") },
  { kind, bytes: Buffer.from(text, "utf16le") },
]);

/** Names the tool behind a proxy DLL from the text inside it. */
export const identifyProxyDll = async (
  filePath: string
): Promise<ProxyDllKind> => {
  const found = await findPatternsInFile(
    filePath,
    PATTERNS.map(({ bytes }) => bytes),
    MAX_SCANNED_BYTES
  );
  const kinds = new Set([...found].map((index) => PATTERNS[index].kind));
  return MARKERS.find(({ kind }) => kinds.has(kind))?.kind ?? "unknown";
};

export interface ExistingProxyDll {
  /** The name as it is on disk. */
  fileName: string;
  kind: ProxyDllKind;
}

/**
 * Looks in a game folder for files already using the names ReShade could be
 * installed under, matching the names without regard to case. Files Hydra
 * wrote itself are not reported.
 */
export const findExistingProxyDlls = async (
  directory: string,
  candidateNames: string[],
  ownedFiles: ReadonlySet<string> = new Set()
): Promise<ExistingProxyDll[]> => {
  const wanted = new Set(candidateNames.map((name) => name.toLowerCase()));
  const owned = new Set([...ownedFiles].map((name) => name.toLowerCase()));
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });

  const existing: ExistingProxyDll[] = [];
  for (const entry of entries) {
    const name = entry.name.toLowerCase();
    if (!entry.isFile() || !wanted.has(name) || owned.has(name)) continue;
    existing.push({
      fileName: entry.name,
      kind: await identifyProxyDll(path.join(directory, entry.name)),
    });
  }
  return existing;
};
