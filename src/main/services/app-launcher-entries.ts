import { app } from "electron";
import axios from "axios";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

import { ASSETS_PATH } from "@main/constants";
import { decodeLargestIcoImage } from "@main/helpers/decode-ico";
import {
  desktopEntryFileName,
  renderDesktopEntry,
} from "@main/helpers/desktop-entry";
import { db, gamesSublevel, levelKeys } from "@main/level";
import type { Game, UserPreferences } from "@types";
import { logger } from "./logger";

const ENTRY_PREFIX = "hydraplus-game-";
const ICON_SIZE = 256;
const SYNC_DEBOUNCE_MS = 2000;

/**
 * Where entries go. A dev build only writes them when
 * HYDRA_PLUS_APPLICATIONS_DIR names a folder, so it never replaces the
 * installed app's entries with ones that launch a throwaway dev instance.
 */
const getApplicationsDir = () => {
  if (!app.isPackaged) return process.env.HYDRA_PLUS_APPLICATIONS_DIR ?? null;

  const dataHome =
    process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  return path.join(dataHome, "applications");
};

const getLaunchCommand = () => {
  // An AppImage runs from a new mount point each time; launch the image.
  if (process.env.APPIMAGE) return [process.env.APPIMAGE];
  if (process.defaultApp && process.argv.length >= 2) {
    return [process.execPath, path.resolve(process.argv[1])];
  }
  return [process.execPath];
};

const buildRunLink = (game: Game) =>
  `hydraplus://run?${new URLSearchParams({
    shop: game.shop,
    objectId: game.objectId,
  }).toString()}`;

const readImage = async (url: string) => {
  if (url.startsWith("local:")) {
    return fs.promises.readFile(url.slice("local:".length));
  }

  const response = await axios.get(url, { responseType: "arraybuffer" });
  return Buffer.from(response.data);
};

const toSquarePng = async (url: string, image: Buffer) => {
  let input = sharp(image);

  if (url.toLowerCase().endsWith(".ico")) {
    const decoded = decodeLargestIcoImage(image);
    if (!decoded) throw new Error("Unsupported ICO image");

    input =
      decoded.type === "png"
        ? sharp(decoded.data)
        : sharp(decoded.data, {
            raw: { width: decoded.width, height: decoded.height, channels: 4 },
          });
  }

  return input
    .resize(ICON_SIZE, ICON_SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
};

/**
 * Keeps one desktop entry per installed game in the XDG applications folder,
 * so app launchers can find and start the games. Linux only.
 */
export class AppLauncherEntries {
  private static syncTimer: NodeJS.Timeout | null = null;
  private static syncing: Promise<void> | null = null;
  private static syncAgain = false;
  private static readonly failedIcons = new Set<string>();

  /** Syncs now and again whenever a game or the preferences change. */
  static watch() {
    if (process.platform !== "linux" || !getApplicationsDir()) return;

    gamesSublevel.on("write", () => this.scheduleSync());
    gamesSublevel.on("clear", () => this.scheduleSync());
    db.on("write", (operations: { key?: unknown }[]) => {
      const touchesEntries = operations.some(
        ({ key }) =>
          typeof key === "string" &&
          (key === levelKeys.userPreferences ||
            key.startsWith(gamesSublevel.prefix))
      );
      if (touchesEntries) this.scheduleSync();
    });

    this.scheduleSync();
  }

  static scheduleSync() {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      void this.sync();
    }, SYNC_DEBOUNCE_MS);
  }

  static async sync(): Promise<void> {
    if (this.syncing) {
      this.syncAgain = true;
      return this.syncing;
    }

    this.syncing = this.syncEntries()
      .catch((error) => {
        logger.error("[AppLauncherEntries] Failed to sync entries", error);
      })
      .finally(() => {
        this.syncing = null;
        if (this.syncAgain) {
          this.syncAgain = false;
          void this.sync();
        }
      });

    return this.syncing;
  }

  private static async syncEntries() {
    const applicationsDir = getApplicationsDir();
    if (!applicationsDir) return;

    const userPreferences = await db.get<string, UserPreferences | null>(
      levelKeys.userPreferences,
      { valueEncoding: "json" }
    );
    const enabled = userPreferences?.addGamesToAppLauncher ?? true;

    const games = enabled
      ? (await gamesSublevel.values().all()).filter(
          (game) => !game.isDeleted && game.executablePath
        )
      : [];

    await fs.promises.mkdir(applicationsDir, { recursive: true });

    const wanted = new Set<string>();
    const command = getLaunchCommand();
    let written = 0;

    for (const game of games) {
      const fileName = desktopEntryFileName(
        ENTRY_PREFIX,
        game.shop,
        game.objectId
      );
      wanted.add(fileName);

      const content = renderDesktopEntry({
        name: game.title,
        command: [...command, buildRunLink(game)],
        iconPath: await this.ensureIcon(game),
      });

      const entryPath = path.join(applicationsDir, fileName);
      const current = await fs.promises
        .readFile(entryPath, "utf8")
        .catch(() => null);

      if (current !== content) {
        await fs.promises.writeFile(entryPath, content);
        written += 1;
      }
    }

    const existing = await fs.promises.readdir(applicationsDir);
    let removed = 0;

    for (const fileName of existing) {
      if (!fileName.startsWith(ENTRY_PREFIX) || wanted.has(fileName)) continue;
      await fs.promises.rm(path.join(applicationsDir, fileName), {
        force: true,
      });
      removed += 1;
    }

    if (written > 0 || removed > 0) {
      logger.info(
        `[AppLauncherEntries] Wrote ${written} and removed ${removed} entries in ${applicationsDir}`
      );
    }
  }

  /** A square PNG icon for the game, made once and reused. */
  private static async ensureIcon(game: Game): Promise<string | null> {
    const urls = [
      game.customIconUrl,
      game.iconUrl,
      game.customCoverImageUrl,
    ].filter((url): url is string => Boolean(url));
    if (urls.length === 0) return null;

    // Named after its sources, so changing a custom icon makes a new one.
    const sourceHash = crypto
      .createHash("sha1")
      .update(urls.join("\n"))
      .digest("hex")
      .slice(0, 12);
    const iconPath = path.join(
      ASSETS_PATH,
      `${game.shop}-${game.objectId}`,
      `launcher-icon-${sourceHash}.png`
    );

    if (fs.existsSync(iconPath)) return iconPath;
    if (this.failedIcons.has(iconPath)) return null;

    for (const url of urls) {
      try {
        const png = await toSquarePng(url, await readImage(url));
        await fs.promises.mkdir(path.dirname(iconPath), { recursive: true });
        await fs.promises.writeFile(iconPath, png);
        return iconPath;
      } catch (error) {
        logger.warn(
          `[AppLauncherEntries] Could not make an icon from ${url}`,
          error
        );
      }
    }

    // Not retried until the next app start, so a missing icon cannot make
    // every library write fetch it again.
    this.failedIcons.add(iconPath);
    return null;
  }
}
