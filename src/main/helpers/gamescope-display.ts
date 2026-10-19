import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BrowserWindow, screen } from "electron";
import type { GamescopeSettings } from "@types";
import {
  parseHyprlandRefreshRate,
  parseXrandrRefreshRate,
} from "./display-refresh-rate";

const execFileAsync = promisify(execFile);

const readCommand = (command: string, args: string[]) =>
  execFileAsync(command, args, { timeout: 2000 })
    .then(({ stdout }) => stdout)
    .catch(() => null);

// Electron reports 0 Hz on many Wayland sessions, Hyprland included.
const getRefreshRate = async (display: Electron.Display) => {
  if (display.displayFrequency > 0) return display.displayFrequency;

  const outputName = /\(([^()]+)\)$/.exec(display.label)?.[1] ?? null;

  if (process.env.HYPRLAND_INSTANCE_SIGNATURE) {
    const monitors = await readCommand("hyprctl", ["monitors", "-j"]);
    const rate = monitors && parseHyprlandRefreshRate(monitors, outputName);
    if (rate) return rate;
  }

  const xrandr = await readCommand("xrandr", ["--current"]);
  return xrandr ? parseXrandrRefreshRate(xrandr, outputName) : null;
};

/** Inside SteamOS gaming mode and similar sessions gamescope already owns the display. */
export const isGamescopeSession = () =>
  process.env.XDG_CURRENT_DESKTOP?.toLowerCase() === "gamescope";

/**
 * Fills in the output size and frame limit the action leaves empty from the
 * display Hydra's window is on. Nested gamescope otherwise opens at 1280×720
 * and 60 Hz.
 */
export const withDisplayDefaults = async (
  settings: GamescopeSettings
): Promise<GamescopeSettings> => {
  const hasSize = !!settings.width && !!settings.height;
  if (hasSize && settings.fpsLimit) return settings;

  const window =
    BrowserWindow.getFocusedWindow() ??
    BrowserWindow.getAllWindows().find((item) => !item.isDestroyed());
  const display = window
    ? screen.getDisplayMatching(window.getBounds())
    : screen.getPrimaryDisplay();

  const refreshRate = settings.fpsLimit ? null : await getRefreshRate(display);

  return {
    ...settings,
    ...(hasSize
      ? {}
      : {
          width: Math.round(display.size.width * display.scaleFactor),
          height: Math.round(display.size.height * display.scaleFactor),
        }),
    ...(refreshRate ? { fpsLimit: Math.round(refreshRate) } : {}),
  };
};
