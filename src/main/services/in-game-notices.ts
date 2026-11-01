import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { NOTICES_ONLY_MANGOHUD_CONFIG } from "@shared";
import type { Game } from "@types";

import { createNoticeBoard } from "./in-game-notices-core";
import { logger } from "./logger";
import { SystemPath } from "./system-path";

const writeAtomically = async (filePath: string, content: string) => {
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    await fs.promises.writeFile(temporary, content);
    await fs.promises.rename(temporary, filePath);
  } catch (error) {
    logger.warn("[InGameNotices] Could not update the MangoHud config", error);
    await fs.promises.rm(temporary, { force: true });
  }
};

const board = createNoticeBoard({
  write: writeAtomically,
  now: Date.now,
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (timer) => clearTimeout(timer as NodeJS.Timeout),
  noticeMs: 6_000,
});

/** Notices (achievements) shown inside a running game through MangoHud. */
export class InGameNotices {
  /** Writes the notices-only MangoHud config for a game that shows no HUD. */
  public static async prepareNoticesOnlyConfig(
    game: Pick<Game, "shop" | "objectId">,
    { write = true }: { write?: boolean } = {}
  ): Promise<string | null> {
    const directory = path.join(SystemPath.getPath("userData"), "mangohud");
    const configPath = path.join(
      directory,
      `notices-${game.shop}-${game.objectId.replaceAll(/[^\w.-]/g, "_")}.conf`
    );
    if (!write) return configPath;
    try {
      await fs.promises.mkdir(directory, { recursive: true });
      await fs.promises.writeFile(configPath, NOTICES_ONLY_MANGOHUD_CONFIG);
      return configPath;
    } catch (error) {
      logger.warn("[InGameNotices] Could not write the config", error);
      return null;
    }
  }

  /** Remembers the config a launching game reads, so notices can reach it. */
  public static async register(gameKey: string, configPath: string) {
    try {
      board.register(
        gameKey,
        configPath,
        await fs.promises.readFile(configPath, "utf8")
      );
    } catch (error) {
      logger.warn("[InGameNotices] Could not read the MangoHud config", error);
    }
  }

  /** Puts the config back and forgets it when the game ends. */
  public static unregister(gameKey: string) {
    return board.unregister(gameKey);
  }

  /** Shows lines in the running game for a few seconds; false if it can't. */
  public static show(gameKey: string, lines: string[]) {
    return board.show(gameKey, lines) !== null;
  }
}
