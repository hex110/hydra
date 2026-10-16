import path from "node:path";
import { db, gamesSublevel, levelKeys } from "@main/level";
import { parseExecutablePath } from "@main/events/helpers/parse-executable-path";
import { resolveProtonPath } from "@main/helpers/resolve-proton-path";
import { logger } from "@main/services/logger";
import { WindowManager } from "@main/services/window-manager";
import { Wine } from "@main/services/wine";
import type {
  Game,
  GameSetupReason,
  GameSetupStatus,
  GameShop,
  UserPreferences,
} from "@types";

export interface GameSetupContext {
  shop: GameShop;
  objectId: string;
  gameKey: string;
  game: Game;
  executablePath: string;
  gameDirectory: string;
  /** Resolved Wine prefix, or null for native games and non-Linux hosts. */
  winePrefixPath: string | null;
  protonPath: string | null;
  userPreferences: UserPreferences | null;
  reason: GameSetupReason;
  force: boolean;
}

export interface GameSetupStep {
  id: string;
  /** Lower runs first. The Wine prefix step is 100. */
  order: number;
  run: (context: GameSetupContext) => Promise<void>;
}

export interface GameSetupRequest {
  reason: GameSetupReason;
  /** Re-run steps that normally only run once per game. */
  force?: boolean;
}

const isWindowsExecutable = (executablePath: string) =>
  path.extname(executablePath).toLowerCase() === ".exe";

/**
 * Prepares a game after it becomes launchable (download finished, executable
 * picked, found by a library scan): creates its Wine prefix and runs the
 * registered setup steps. Games are processed one at a time because prefix
 * creation is heavy.
 */
export class GameSetup {
  private static readonly steps: GameSetupStep[] = [];
  private static readonly pending = new Map<string, GameSetupRequest>();
  private static queue: Promise<void> = Promise.resolve();

  public static registerStep(step: GameSetupStep) {
    if (this.steps.some((existing) => existing.id === step.id)) return;

    this.steps.push(step);
    this.steps.sort((a, b) => a.order - b.order);
  }

  public static isPending(shop: GameShop, objectId: string) {
    return this.pending.has(levelKeys.game(shop, objectId));
  }

  /** Queues setup for a game; a game already waiting in the queue is not added twice. */
  public static enqueue(
    shop: GameShop,
    objectId: string,
    request: GameSetupRequest
  ): Promise<void> {
    const gameKey = levelKeys.game(shop, objectId);
    const waiting = this.pending.get(gameKey);

    if (waiting) {
      waiting.force ||= request.force === true;
      return this.queue;
    }

    this.pending.set(gameKey, { ...request });
    this.sendStatus(shop, objectId, "queued");

    this.queue = this.queue.then(async () => {
      const queuedRequest = this.pending.get(gameKey) ?? request;
      this.pending.delete(gameKey);

      try {
        await this.run(shop, objectId, queuedRequest);
      } catch (error) {
        logger.error("[GameSetup] Setup failed", { gameKey, error });
        this.sendStatus(shop, objectId, "failed");
      }
    });

    return this.queue;
  }

  private static async run(
    shop: GameShop,
    objectId: string,
    request: GameSetupRequest
  ) {
    const context = await this.createContext(shop, objectId, request);

    if (!context) {
      this.sendStatus(shop, objectId, "skipped");
      return;
    }

    logger.info("[GameSetup] Running setup", {
      gameKey: context.gameKey,
      reason: context.reason,
      force: context.force,
      steps: this.steps.map((step) => step.id),
    });

    this.sendStatus(shop, objectId, "running");
    let failed = false;

    for (const step of this.steps) {
      this.sendStatus(shop, objectId, "running", step.id);

      try {
        await step.run(context);
      } catch (error) {
        failed = true;
        logger.error(`[GameSetup] Step "${step.id}" failed`, {
          gameKey: context.gameKey,
          error,
        });
      }

      const refreshed = await gamesSublevel.get(context.gameKey);
      if (refreshed) context.game = refreshed;
    }

    this.sendStatus(shop, objectId, failed ? "failed" : "completed");
    WindowManager.sendToAppWindows("on-library-batch-complete");
  }

  private static async createContext(
    shop: GameShop,
    objectId: string,
    request: GameSetupRequest
  ): Promise<GameSetupContext | null> {
    const gameKey = levelKeys.game(shop, objectId);
    const game = await gamesSublevel.get(gameKey);

    if (!game || game.isDeleted || !game.executablePath) return null;
    // Hydra does not own the files of games managed by another launcher.
    if (game.hasActiveSteamImport || game.epicInstallation) return null;

    const executablePath = parseExecutablePath(game.executablePath);
    // Steam installs run through Steam with Steam's own prefix.
    if (/[\\/]steamapps[\\/]common[\\/]/i.test(executablePath)) return null;

    const userPreferences = await db
      .get<string, UserPreferences | null>(levelKeys.userPreferences, {
        valueEncoding: "json",
      })
      .catch(() => null);

    const usesCompatibilityLayer =
      process.platform === "linux" && isWindowsExecutable(executablePath);

    const winePrefixPath = usesCompatibilityLayer
      ? await Wine.resolvePrefixPath(
          Wine.getEffectivePrefixPath(game.winePrefixPath, objectId)
        )
      : null;

    return {
      shop,
      objectId,
      gameKey,
      game,
      executablePath,
      gameDirectory: path.dirname(executablePath),
      winePrefixPath,
      protonPath: usesCompatibilityLayer
        ? await resolveProtonPath(game.protonPath)
        : null,
      userPreferences,
      reason: request.reason,
      force: request.force === true,
    };
  }

  private static sendStatus(
    shop: GameShop,
    objectId: string,
    status: GameSetupStatus,
    stepId?: string
  ) {
    WindowManager.sendToAppWindows("on-game-setup-status", {
      shop,
      objectId,
      status,
      stepId: stepId ?? null,
    });
  }
}
