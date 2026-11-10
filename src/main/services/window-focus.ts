import { execFile } from "node:child_process";
import type { BrowserWindow } from "electron";

import { logger } from "./logger";

const FOCUS_CHECK_DELAY_MS = 150;

const runHyprctl = (args: string[]) =>
  new Promise<boolean>((resolve) => {
    execFile("hyprctl", args, { timeout: 2000 }, (error, stdout) => {
      resolve(!error && stdout.trim() === "ok");
    });
  });

/**
 * Hyprland ignores a background window's own focus request unless the user set
 * misc:focus_on_activate, and Electron has no way to pass on the notification
 * server's activation token. Asking the compositor directly is what works.
 * The legacy dispatcher fails on a Lua config, which needs `eval` instead.
 */
const focusOnHyprland = async (pid: number) => {
  if (await runHyprctl(["dispatch", "focuswindow", `pid:${pid}`])) return;
  const lua = `hl.dispatch(hl.dsp.focus({ window = "pid:${pid}" }))`;
  if (!(await runHyprctl(["eval", lua]))) {
    logger.warn("Hyprland refused to focus the window");
  }
};

/** Shows, restores and focuses a window, also where the compositor resists. */
export const bringWindowToFront = (window: BrowserWindow) => {
  if (window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();

  if (process.platform !== "linux" || !process.env.HYPRLAND_INSTANCE_SIGNATURE)
    return;

  setTimeout(() => {
    if (window.isDestroyed() || window.isFocused()) return;
    void focusOnHyprland(process.pid);
  }, FOCUS_CHECK_DELAY_MS);
};
