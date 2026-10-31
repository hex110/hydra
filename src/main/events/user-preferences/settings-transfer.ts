import fs from "node:fs";
import path from "node:path";
import { BrowserWindow, dialog } from "electron";

import { db, levelKeys } from "@main/level";
import { logger } from "@main/services/logger";
import { SystemPath } from "@main/services/system-path";
import {
  buildSettingsFile,
  readSettingsFile,
} from "@main/services/settings-transfer/settings-transfer-core";
import type { SettingsTransferResult, UserPreferences } from "@types";

import { registerEvent } from "../register-event";
import { applyUserPreferences } from "./update-user-preferences";

const FILTERS = [{ name: "Hydra Plus settings", extensions: ["json"] }];

const exportSettings = async (
  event: Electron.IpcMainInvokeEvent,
  includeSecrets: boolean
): Promise<SettingsTransferResult> => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const options: Electron.SaveDialogOptions = {
    defaultPath: path.join(
      SystemPath.getPath("documents"),
      "hydra-plus-settings.json"
    ),
    filters: FILTERS,
    properties: ["createDirectory", "showOverwriteConfirmation"],
  };
  const choice = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options);
  if (choice.canceled || !choice.filePath) return { status: "cancelled" };

  try {
    const preferences = await db
      .get<string, UserPreferences | null>(levelKeys.userPreferences, {
        valueEncoding: "json",
      })
      .catch(() => null);
    const file = buildSettingsFile(preferences, {
      homePath: SystemPath.getPath("home"),
      includeSecrets,
      now: new Date(),
    });
    await fs.promises.writeFile(
      choice.filePath,
      `${JSON.stringify(file, null, 2)}\n`,
      // The file may hold API keys.
      { mode: 0o600 }
    );
    return { status: "done", path: choice.filePath };
  } catch (error) {
    logger.error("Could not export settings", error);
    return { status: "failed", message: String(error) };
  }
};

const importSettings = async (
  event: Electron.IpcMainInvokeEvent
): Promise<SettingsTransferResult> => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const options: Electron.OpenDialogOptions = {
    filters: FILTERS,
    properties: ["openFile"],
  };
  const choice = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  const filePath = choice.filePaths[0];
  if (choice.canceled || !filePath) return { status: "cancelled" };

  try {
    const preferences = readSettingsFile(
      await fs.promises.readFile(filePath, "utf8"),
      { homePath: SystemPath.getPath("home") }
    );
    await applyUserPreferences(preferences);
    return { status: "done", path: filePath };
  } catch (error) {
    logger.error("Could not import settings", error);
    return {
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

registerEvent("exportSettings", exportSettings);
registerEvent("importSettings", importSettings);
