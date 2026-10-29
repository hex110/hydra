import path from "node:path";
import { app } from "electron";
import { appendDirectoryToPath } from "../../shared/bundled-commands.js";
import { logger } from "./logger";

/** Folders of scripts Hydra ships, such as `hypr-hdr` for the Hyprland HDR launch rule. */
const getBundledCommandDirectories = () =>
  process.platform === "linux"
    ? [
        app.isPackaged
          ? path.join(process.resourcesPath, "hypr-hdr")
          : path.join(__dirname, "..", "..", "resources", "hypr-hdr"),
      ]
    : [];

/**
 * Makes the bundled scripts runnable by name from launch options. They go at
 * the end of PATH, so a script of the same name that the user installed wins.
 */
export const addBundledCommandsToPath = () => {
  for (const directory of getBundledCommandDirectories()) {
    process.env.PATH = appendDirectoryToPath(process.env.PATH, directory);
  }
  logger.info("Bundled commands added to PATH");
};
