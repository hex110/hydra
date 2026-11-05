import fs from "node:fs";
import path from "node:path";
import { BrowserWindow } from "electron";
import {
  addTemplateToMatugenConfig,
  MATUGEN_CONFIG_TABLE,
  MATUGEN_TEMPLATE,
  parseMatugenPalette,
  type MatugenPalette,
} from "@shared";
import type {
  MatugenPaletteSetupResult,
  MatugenPaletteState,
  MatugenPaletteStatus,
} from "@types";
import { db, levelKeys } from "@main/level";
import { logger } from "./logger";
import { SystemPath } from "./system-path";

interface StoredSettings {
  enabled: boolean;
  path: string | null;
}

const POLL_INTERVAL_MS = 1_000;
// matugen rewrites the file in one go, but a read can still land mid-write.
const SETTLE_DELAY_MS = 150;
const RETRY_EMPTY_DELAY_MS = 400;

let settings: StoredSettings = { enabled: false, path: null };
let palette: MatugenPalette = {};
let status: MatugenPaletteStatus = "off";
let watchedPath: string | null = null;
let refreshTimer: NodeJS.Timeout | null = null;

const workDirectory = () =>
  path.join(SystemPath.getPath("userData"), "matugen");

const templatePath = () => path.join(workDirectory(), "template.css");

const defaultPalettePath = () => path.join(workDirectory(), "palette.css");

const matugenConfigPath = () =>
  path.join(
    process.env.XDG_CONFIG_HOME ||
      path.join(SystemPath.getPath("home"), ".config"),
    "matugen",
    "config.toml"
  );

const expandHome = (value: string) =>
  value === "~" || value.startsWith("~/")
    ? path.join(SystemPath.getPath("home"), value.slice(1))
    : value;

const palettePath = () => {
  const custom = settings.path?.trim();
  return custom ? path.resolve(expandHome(custom)) : defaultPalettePath();
};

const readIfExists = async (file: string) => {
  try {
    return await fs.promises.readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const getState = async (): Promise<MatugenPaletteState> => {
  const config = await readIfExists(matugenConfigPath()).catch(() => null);

  return {
    enabled: settings.enabled,
    status,
    path: palettePath(),
    defaultPath: defaultPalettePath(),
    palette,
    templatePath: templatePath(),
    configPath: matugenConfigPath(),
    templateConfigured: config !== null && MATUGEN_CONFIG_TABLE.test(config),
  };
};

const broadcast = async () => {
  const state = await getState();

  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send("on-matugen-palette-updated", state);
  }
};

const readPalette = async (): Promise<{
  palette: MatugenPalette;
  status: MatugenPaletteStatus;
}> => {
  try {
    const css = await fs.promises.readFile(palettePath(), "utf8");
    const parsed = parseMatugenPalette(css);
    return {
      palette: parsed,
      status: Object.keys(parsed).length ? "applied" : "empty",
    };
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    return { palette: {}, status: missing ? "waiting" : "unreadable" };
  }
};

const refresh = async (retryEmpty = true) => {
  if (!settings.enabled) {
    palette = {};
    status = "off";
    await broadcast();
    return;
  }

  let next = await readPalette();

  // An empty read right after a palette was live is most likely a write in
  // progress; look again before dropping back to the stock colours.
  if (next.status !== "applied" && status === "applied" && retryEmpty) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_EMPTY_DELAY_MS));
    next = await readPalette();
  }

  palette = next.palette;
  status = next.status;
  await broadcast();
};

const scheduleRefresh = () => {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refresh().catch((error) =>
      logger.error("Failed to refresh matugen palette", error)
    );
  }, SETTLE_DELAY_MS);
};

const stopWatching = () => {
  if (watchedPath) fs.unwatchFile(watchedPath);
  watchedPath = null;
};

// watchFile polls, which copes with the file not existing yet and with
// writers that replace it instead of rewriting it.
const startWatching = () => {
  stopWatching();
  if (!settings.enabled) return;

  watchedPath = palettePath();
  fs.watchFile(
    watchedPath,
    { interval: POLL_INTERVAL_MS, persistent: false },
    scheduleRefresh
  );
};

const persist = () =>
  db.put<string, StoredSettings>(levelKeys.matugenPalette, settings, {
    valueEncoding: "json",
  });

const applySettings = async () => {
  startWatching();
  await refresh(false);
};

export const startMatugenPalette = async () => {
  try {
    const stored = await db.get<string, StoredSettings | undefined>(
      levelKeys.matugenPalette,
      { valueEncoding: "json" }
    );
    if (stored)
      settings = { enabled: !!stored.enabled, path: stored.path ?? null };
  } catch (error) {
    logger.warn("Could not read matugen palette settings", error);
  }

  startWatching();
  await refresh(false);
};

export const getMatugenPalette = () => getState();

export const setMatugenPalette = async (
  update: Partial<StoredSettings>
): Promise<MatugenPaletteState> => {
  settings = {
    enabled: update.enabled ?? settings.enabled,
    path: update.path === undefined ? settings.path : update.path || null,
  };

  await persist();
  await applySettings();
  return getState();
};

/** Writes the template, adds it to the matugen config and turns the palette on. */
export const setupMatugenPalette =
  async (): Promise<MatugenPaletteSetupResult> => {
    await fs.promises.mkdir(workDirectory(), { recursive: true });
    await fs.promises.writeFile(templatePath(), MATUGEN_TEMPLATE);

    const configPath = matugenConfigPath();
    const existing = await readIfExists(configPath);
    const { config, changed } = addTemplateToMatugenConfig(
      existing,
      templatePath(),
      defaultPalettePath()
    );

    if (changed) {
      await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
      if (existing !== null) {
        // Keep the first backup; later setups must not overwrite it.
        await fs.promises
          .copyFile(
            configPath,
            `${configPath}.bak-hydra-plus`,
            fs.constants.COPYFILE_EXCL
          )
          .catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "EEXIST") throw error;
          });
      }
      await fs.promises.writeFile(configPath, config);
    }

    // The block points matugen at the default output, so read that file.
    await setMatugenPalette({ enabled: true, path: null });

    return { configPath, configChanged: changed };
  };
