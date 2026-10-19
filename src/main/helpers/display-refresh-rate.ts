/** Refresh rate of `outputName` (or the focused monitor) from `hyprctl monitors -j`. */
export const parseHyprlandRefreshRate = (
  json: string,
  outputName: string | null
): number | null => {
  try {
    const monitors = JSON.parse(json) as {
      name?: string;
      focused?: boolean;
      refreshRate?: number;
    }[];
    const monitor =
      monitors.find((item) => outputName && item.name === outputName) ??
      monitors.find((item) => item.focused) ??
      monitors[0];

    return monitor?.refreshRate && monitor.refreshRate > 0
      ? monitor.refreshRate
      : null;
  } catch {
    return null;
  }
};

/** Refresh rate of the current mode (`*`) of `outputName`, or the first output, from `xrandr --current`. */
export const parseXrandrRefreshRate = (
  output: string,
  outputName: string | null
): number | null => {
  let inOutput = false;
  let fallback: number | null = null;

  for (const line of output.split("\n")) {
    const header = /^(\S+) connected/.exec(line);
    if (header) {
      inOutput = !outputName || header[1] === outputName;
      continue;
    }

    const current = /\s(\d+(?:\.\d+)?)\*/.exec(line);
    if (!current) continue;

    const rate = Number(current[1]);
    if (inOutput) return rate;
    fallback ??= rate;
  }

  return fallback;
};
