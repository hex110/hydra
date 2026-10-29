import fs from "node:fs";
import path from "node:path";
import { findPatternsInFile } from "./file-scan.js";
import { readPeFile, type PeArchitecture } from "./pe-file.js";

const MAX_SCANNED_BYTES = 512 * 1024 * 1024;
const MAX_EXECUTABLES = 4;
/** Unity loads its graphics API from here, so it says more than the executable. */
const UNITY_PLAYER = "UnityPlayer.dll";

/**
 * The DLL a game reaches each API through. Direct3D 10, 11 and 12 all go
 * through dxgi.dll, so one entry covers them.
 */
const API_LIBRARIES = {
  vulkan: ["vulkan-1.dll"],
  direct3d9: ["d3d9.dll"],
  dxgi: ["d3d10.dll", "d3d10_1.dll", "d3d11.dll", "d3d12.dll", "dxgi.dll"],
  opengl: ["opengl32.dll"],
} as const;

type ApiName = keyof typeof API_LIBRARIES;

const API_NAMES = Object.keys(API_LIBRARIES) as ApiName[];
const LIBRARY_NAMES = API_NAMES.flatMap((api) => API_LIBRARIES[api]);
const LIBRARY_BUFFERS = LIBRARY_NAMES.map((name) => ({
  name,
  bytes: Buffer.from(name),
}));

/** Which graphics APIs a game's files reach. */
export type DetectedApis = Record<ApiName, boolean>;

export interface GameGraphics {
  /** Of the game's executable; null when it could not be read as a PE file. */
  architecture: PeArchitecture | null;
  apis: DetectedApis;
}

/** The coarse view OptiScaler's proxy DLL choice needs. */
export interface GraphicsApis {
  vulkan: boolean;
  direct3d: boolean;
}

const noApis = (): DetectedApis => ({
  vulkan: false,
  direct3d9: false,
  dxgi: false,
  opengl: false,
});

const apisFromLibraries = (libraries: Iterable<string>): DetectedApis => {
  const names = new Set(libraries);
  const apis = noApis();
  for (const api of API_NAMES) {
    apis[api] = API_LIBRARIES[api].some((name) => names.has(name));
  }
  return apis;
};

const hasAny = (apis: DetectedApis) => API_NAMES.some((api) => apis[api]);

const mergeApis = (target: DetectedApis, source: DetectedApis) => {
  for (const api of API_NAMES) target[api] ||= source[api];
};

/**
 * Looks for the library names anywhere in the file. Covers libraries loaded
 * by name at run time, which an import table does not list.
 */
const scanForLibraryNames = async (filePath: string) => {
  const found = await findPatternsInFile(
    filePath,
    LIBRARY_BUFFERS.map(({ bytes }) => bytes),
    MAX_SCANNED_BYTES
  );
  return [...found].map((index) => LIBRARY_NAMES[index]);
};

interface FileGraphics extends GameGraphics {
  /** Whether the file was readable at all. */
  readable: boolean;
}

/**
 * The APIs one file reaches. The import tables decide when they name a
 * graphics library; a file that names none (a game that loads its API from
 * another DLL, or from a name it builds at run time) falls back to a scan for
 * the library names.
 */
const detectInFile = async (filePath: string): Promise<FileGraphics> => {
  const pe = await readPeFile(filePath).catch(() => null);
  const imported = apisFromLibraries(
    pe ? [...pe.imports, ...pe.delayImports] : []
  );
  if (hasAny(imported)) {
    return {
      architecture: pe?.architecture ?? null,
      apis: imported,
      readable: true,
    };
  }

  const apis = apisFromLibraries(await scanForLibraryNames(filePath));
  return { architecture: pe?.architecture ?? null, apis, readable: true };
};

export const detectGraphicsApisInFile = async (
  filePath: string
): Promise<GraphicsApis> => {
  const { apis } = await detectInFile(filePath);
  return toGraphicsApis(apis);
};

const toGraphicsApis = (apis: DetectedApis): GraphicsApis => ({
  vulkan: apis.vulkan,
  direct3d: apis.direct3d9 || apis.dxgi,
});

const detected = new Map<string, GameGraphics | null>();

/**
 * The architecture and graphics APIs of a game, from its executable, the
 * other executables beside it (the real one sits behind a bootstrap
 * executable in some games) and UnityPlayer.dll. Null when nothing could be
 * read.
 */
export const detectGameGraphics = async (
  executablePath: string
): Promise<GameGraphics | null> => {
  // Reading a large executable takes a moment; the options page asks often.
  const stat = await fs.promises.stat(executablePath).catch(() => null);
  const key = stat
    ? `${executablePath}:${stat.size}:${stat.mtimeMs}`
    : executablePath;
  if (detected.has(key)) return detected.get(key) ?? null;

  const graphics = await scanGame(executablePath);
  detected.set(key, graphics);
  return graphics;
};

/** The same, reduced to what OptiScaler's proxy DLL choice needs. */
export const detectGraphicsApis = async (
  executablePath: string
): Promise<GraphicsApis | null> => {
  const graphics = await detectGameGraphics(executablePath);
  return graphics && toGraphicsApis(graphics.apis);
};

const scanGame = async (
  executablePath: string
): Promise<GameGraphics | null> => {
  const directory = path.dirname(executablePath);
  const siblings = await fs.promises
    .readdir(directory, { withFileTypes: true })
    .catch(() => [] as fs.Dirent[]);

  const candidates = new Map<string, number>();
  let unityPlayer: string | null = null;
  for (const entry of siblings) {
    if (!entry.isFile()) continue;
    const filePath = path.join(directory, entry.name);

    if (entry.name.toLowerCase() === UNITY_PLAYER.toLowerCase()) {
      unityPlayer = filePath;
    } else if (path.extname(entry.name).toLowerCase() === ".exe") {
      const stat = await fs.promises.stat(filePath).catch(() => null);
      if (stat) candidates.set(filePath, stat.size);
    }
  }

  const files = [
    executablePath,
    ...[...candidates]
      .filter(([filePath]) => filePath !== executablePath)
      .sort((a, b) => b[1] - a[1])
      .map(([filePath]) => filePath),
  ].slice(0, MAX_EXECUTABLES);
  if (unityPlayer) files.push(unityPlayer);

  const combined: GameGraphics = { architecture: null, apis: noApis() };
  let scanned = 0;

  for (const filePath of files) {
    try {
      const result = await detectInFile(filePath);
      if (filePath === executablePath)
        combined.architecture = result.architecture;
      mergeApis(combined.apis, result.apis);
      scanned++;
    } catch {
      // An unreadable file says nothing about the game.
    }
  }

  return scanned > 0 ? combined : null;
};
