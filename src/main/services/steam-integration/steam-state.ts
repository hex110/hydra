import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { shell } from "electron";
import WinReg from "winreg";
import type { SteamState } from "@types";
import { getSteamLocation } from "../steam";
import { SystemPath } from "../system-path";
import { steamSyncLogger } from "../logger";
import { focusHyprlandWindow } from "../window-focus";
import { WindowManager } from "../window-manager";
import { isSteamRunning, parseSteamPid } from "./steam-state-core";

const POLL_INTERVAL_MS = 3000;
const FOCUS_DELAY_MS = 700;

const readFirstFile = async (candidates: string[]) => {
  for (const candidate of candidates) {
    const content = await fs.promises
      .readFile(candidate, "utf8")
      .catch(() => null);
    if (content !== null) return content;
  }
  return null;
};

const readWindowsPidFile = () =>
  new Promise<string | null>((resolve) => {
    new WinReg({
      hive: WinReg.HKCU,
      key: "\\Software\\Valve\\Steam\\ActiveProcess",
    }).get("pid", (error, item) => resolve(error || !item ? null : item.value));
  });

const readProcessName = async (pid: number) => {
  try {
    process.kill(pid, 0);
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    if ((error as NodeJS.ErrnoException).code !== "EPERM") return null;
  }

  if (process.platform !== "linux") return "";
  return fs.promises
    .readFile(`/proc/${pid}/comm`, "utf8")
    .then((name) => name.trim())
    .catch(() => null);
};

const detectInstalled = async () => {
  const location = await getSteamLocation().catch(() => null);
  return !!location && fs.existsSync(location) ? location : null;
};

const readState = async (): Promise<SteamState> => {
  const location = await detectInstalled();
  if (!location) return { installed: false, running: false };

  const home = SystemPath.getPath("home");
  const pidFile =
    process.platform === "win32"
      ? await readWindowsPidFile()
      : await readFirstFile([
          path.join(home, ".steam", "steam.pid"),
          path.join(location, "steam.pid"),
        ]);
  const pid = parseSteamPid(pidFile);
  const processName = pid === null ? null : await readProcessName(pid);

  return {
    installed: true,
    running: isSteamRunning({
      pidFile,
      processName,
      trustLiveProcess: process.platform !== "linux",
    }),
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const runDetached = (command: string, args: string[]) =>
  new Promise<boolean>((resolve) => {
    try {
      const child = spawn(command, args, { detached: true, stdio: "ignore" });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });

/** Whether Steam is installed and running, kept current for the header button. */
export class SteamStateService {
  private static current: SteamState = { installed: false, running: false };
  private static timer: NodeJS.Timeout | undefined;

  public static get() {
    return this.current;
  }

  /** Reads the state now and tells the windows when it changed. */
  public static async refresh() {
    const next = await readState().catch((error) => {
      steamSyncLogger.error("Could not read Steam's state", error);
      return this.current;
    });

    if (
      next.installed !== this.current.installed ||
      next.running !== this.current.running
    ) {
      this.current = next;
      WindowManager.sendToAppWindows("on-steam-state-changed", next);
    }

    return this.current;
  }

  public static start() {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
  }

  /** Waits for Steam to start (`running`) or to exit (`!running`). */
  public static async waitFor(running: boolean, timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if ((await this.refresh()).running === running) return true;
      if (Date.now() >= deadline) return false;
      await sleep(1000);
    }
  }

  /**
   * Starts Steam, or shows and focuses its window when it already runs (also
   * when it only lives in the tray). Steam's own `steam://open/main` does the
   * showing; on Hyprland the window is then focused through the compositor.
   */
  public static async open() {
    const wasRunning = (await this.refresh()).running;

    if (!wasRunning && process.platform === "linux") {
      // Without a running Steam there is nothing to hand the URL to.
      const started =
        (await runDetached("steam", [])) ||
        (await runDetached("flatpak", ["run", "com.valvesoftware.Steam"]));
      if (!started) await shell.openExternal("steam://open/main");
    } else {
      await shell.openExternal("steam://open/main");
    }

    void this.refresh();
    if (
      wasRunning &&
      process.platform === "linux" &&
      process.env.HYPRLAND_INSTANCE_SIGNATURE
    ) {
      setTimeout(() => void focusHyprlandWindow("class:steam"), FOCUS_DELAY_MS);
    }
  }

  /** Asks Steam to exit and waits for it; false when it is still running. */
  public static async shutdown(timeoutMs: number) {
    if (!(await this.refresh()).running) return true;

    if (process.platform === "linux") {
      await new Promise<void>((resolve) =>
        execFile("steam", ["-shutdown"], { timeout: 5000 }, () => resolve())
      );
    }
    await shell.openExternal("steam://exit").catch(() => undefined);

    return this.waitFor(false, timeoutMs);
  }
}
