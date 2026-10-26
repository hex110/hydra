import { BrowserWindow, type Cookie } from "electron";
import { logger } from "@main/services/logger";
import { getSourceSession } from "./source-session";

const WINDOW_WIDTH = 900;
const WINDOW_HEIGHT = 720;
const CLEARANCE_COOKIE = "cf_clearance";
/** Lets the page finish its redirect to the source after the cookie lands. */
const CLOSE_DELAY_MS = 1200;

const openWindows = new Map<string, BrowserWindow>();

const isHttps = (url: string) => {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
};

const cookieCoversHost = (cookie: Cookie, host: string) => {
  const domain = cookie.domain?.replace(/^\./, "");
  return !!domain && (host === domain || host.endsWith(`.${domain}`));
};

/**
 * Opens the source in a normal browser window so the person can pass the
 * host's Cloudflare challenge. The clearance cookie stays in Hydra's source
 * session and later refreshes send it. Resolves when the window closes, which
 * it does by itself once the cookie arrives.
 */
export const verifySourceInBrowser = (url: string, title: string) =>
  new Promise<void>((resolve) => {
    const { host } = new URL(url);

    const existing = openWindows.get(host);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      existing.once("closed", () => resolve());
      return;
    }

    const sourceSession = getSourceSession();
    const window = new BrowserWindow({
      title,
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
      autoHideMenuBar: true,
      webPreferences: {
        session: sourceSession,
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
      },
    });
    openWindows.set(host, window);
    window.setMenu(null);

    let closeTimer: NodeJS.Timeout | null = null;
    const onCookieChanged = (
      _event: Electron.Event,
      cookie: Cookie,
      _cause: string,
      removed: boolean
    ) => {
      if (removed || cookie.name !== CLEARANCE_COOKIE) return;
      if (!cookieCoversHost(cookie, host) || closeTimer) return;
      closeTimer = setTimeout(() => {
        if (!window.isDestroyed()) window.close();
      }, CLOSE_DELAY_MS);
    };
    sourceSession.cookies.on("changed", onCookieChanged);

    const { webContents } = window;
    webContents.on("will-navigate", (event, target) => {
      if (!isHttps(target)) event.preventDefault();
    });
    webContents.on("will-redirect", (event, target) => {
      if (!isHttps(target)) event.preventDefault();
    });
    webContents.on("will-attach-webview", (event) => event.preventDefault());
    webContents.setWindowOpenHandler(() => ({ action: "deny" }));

    window.on("closed", () => {
      if (closeTimer) clearTimeout(closeTimer);
      sourceSession.cookies.off("changed", onCookieChanged);
      if (openWindows.get(host) === window) openWindows.delete(host);
      resolve();
    });

    window.loadURL(url).catch((error: unknown) => {
      // Aborted loads are the challenge redirecting; anything else shows in the window.
      logger.warn("[LocalSources] Verification window failed to load", {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
