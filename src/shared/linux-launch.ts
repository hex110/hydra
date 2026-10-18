import type { GamescopeSettings, MangoHudSettings, ProtonFlavor } from "@types";

export const MANGOHUD_METRICS = [
  "fps",
  "frametime",
  "frame_timing",
  "gpu_stats",
  "gpu_temp",
  "gpu_power",
  "cpu_stats",
  "cpu_temp",
  "vram",
  "ram",
  "resolution",
  "engine_version",
  "vulkan_driver",
  "wine",
  "present_mode",
  "fsr",
  "hdr",
] as const;

export const DEFAULT_MANGOHUD_SETTINGS: MangoHudSettings = {
  position: "top-left",
  metrics: ["fps", "frametime", "frame_timing", "gpu_stats", "cpu_stats"],
  fpsLimit: null,
  horizontal: false,
  showUpscaler: false,
  extra: "",
};

/**
 * A MangoHud config file for the settings. `upscalerCommand` is a shell
 * command whose output names the active upscaler; it is shown on its own line.
 */
export const buildMangoHudConfig = (
  settings: MangoHudSettings,
  upscalerCommand?: string | null
): string => {
  const lines = [
    "# Written by Hydra Plus for this launch; edit it in the game's options.",
    "legacy_layout=0",
    `position=${settings.position}`,
    ...settings.metrics,
    ...(settings.horizontal ? ["horizontal"] : []),
    ...(settings.fpsLimit && settings.fpsLimit > 0
      ? [`fps_limit=${Math.floor(settings.fpsLimit)}`]
      : []),
    ...(settings.showUpscaler && upscalerCommand
      ? ["custom_text=Upscaler", `exec=${upscalerCommand}`]
      : []),
    ...settings.extra
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  ];
  return `${lines.join("\n")}\n`;
};

const quoteArgument = (value: string) =>
  /^[\w@%+=:,./-]+$/.test(value) ? value : `"${value.replaceAll('"', '\\"')}"`;

const positive = (value: number | null | undefined) =>
  typeof value === "number" && value > 0 ? Math.floor(value) : null;

/** Launch options that run the game inside gamescope; null when nothing is set. */
export const buildGamescopeLaunchOptions = (
  settings: GamescopeSettings | null | undefined
): string | null => {
  if (!settings) return null;

  const args: string[] = [];
  const width = positive(settings.width);
  const height = positive(settings.height);
  const gameWidth = positive(settings.gameWidth);
  const gameHeight = positive(settings.gameHeight);
  const fpsLimit = positive(settings.fpsLimit);

  if (width) args.push("-W", String(width));
  if (height) args.push("-H", String(height));
  if (gameWidth) args.push("-w", String(gameWidth));
  if (gameHeight) args.push("-h", String(gameHeight));
  if (fpsLimit) args.push("-r", String(fpsLimit));
  if (settings.fullscreen) args.push("-f");
  if (settings.hdr) args.push("--hdr-enabled");
  const extra = settings.extraArgs?.trim();

  return [
    "gamescope",
    ...args.map(quoteArgument),
    ...(extra ? [extra] : []),
    "--",
    "%command%",
  ].join(" ");
};

export const PROTON_FLAVORS: ProtonFlavor[] = ["ge-proton", "proton-cachyos"];

/** Which managed flavor a Proton build's folder or display name belongs to. */
export const getProtonFlavor = (name: string): ProtonFlavor | null => {
  const lower = name.toLowerCase();
  if (lower.startsWith("ge-proton")) return "ge-proton";
  if (lower.startsWith("proton-cachyos")) return "proton-cachyos";
  return null;
};

const numberChunks = (name: string) =>
  (name.match(/\d+/g) ?? []).map((chunk) => Number(chunk));

/** Orders Proton build names by the numbers in them, newest first. */
export const compareProtonNamesNewestFirst = (a: string, b: string) => {
  const left = numberChunks(a);
  const right = numberChunks(b);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (right[index] ?? -1) - (left[index] ?? -1);
    if (difference !== 0) return difference;
  }
  return a.localeCompare(b);
};

/** A launch rule's Proton choice: a build path, or the newest build of a flavor. */
export const parseProtonChoice = (
  value: string | null | undefined
): { flavor: ProtonFlavor } | { path: string } | null => {
  if (!value) return null;
  const match = /^(ge-proton|proton-cachyos):latest$/.exec(value);
  if (match) return { flavor: match[1] as ProtonFlavor };
  return { path: value };
};
