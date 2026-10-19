import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "@main/services/logger";

const getApplicationDirectories = () => {
  const dataHome =
    process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  const dataDirs = (process.env.XDG_DATA_DIRS || "/usr/local/share:/usr/share")
    .split(":")
    .filter(Boolean);

  return [dataHome, ...dataDirs].map((directory) =>
    path.join(directory, "applications")
  );
};

/**
 * Makes this app's desktop file the handler for `scheme`, for when Electron's
 * own registration fails. Electron goes through `xdg-settings`, which reads
 * the binary from the desktop file's `Exec` line up to the first space and
 * gives up on a quoted path such as `"/opt/Hydra Plus/hydra-plus"`. `xdg-mime`
 * writes the same `mimeapps.list` entry without that check.
 */
export const registerLinuxSchemeHandler = (scheme: string) => {
  const desktopFile = process.env.CHROME_DESKTOP;
  if (!desktopFile) return;

  const isInstalled = getApplicationDirectories().some((directory) =>
    fs.existsSync(path.join(directory, desktopFile))
  );
  if (!isInstalled) return;

  execFile(
    "xdg-mime",
    ["default", desktopFile, `x-scheme-handler/${scheme}`],
    (error) => {
      if (error) {
        logger.warn(`Failed to register the ${scheme}:// handler`, error);
      }
    }
  );
};
