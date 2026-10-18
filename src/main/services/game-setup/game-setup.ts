import path from "node:path";
import { db, gamesSublevel, levelKeys } from "@main/level";
import { updateGameRecord } from "@main/services/game-record-updater";
import { parseExecutablePath } from "@main/events/helpers/parse-executable-path";
import { resolveGameProton } from "@main/helpers/resolve-proton-path";
import { getLaunchAdditions } from "@main/helpers/launch-additions";
import { logger } from "@main/services/logger";
import { WindowManager } from "@main/services/window-manager";
import { Wine } from "@main/services/wine";
import type {
  Game,
  GameSetupLogEntry,
  GameSetupReason,
  GameSetupSkipReason,
  GameSetupStatus,
  GameSetupStepResult,
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
  /** Returns what the step did for the setup log; nothing means "done". */
  run: (context: GameSetupContext) => Promise<GameSetupStepResult | void>;
}

export interface GameSetupRequest {
  reason: GameSetupReason;
  /** Re-run steps that normally only run once per game. */
  force?: boolean;
  /** Run only these steps; the others keep their last log entry. */
  steps?: string[];
}

export const skipped = (
  code: string,
  params?: GameSetupStepResult["params"]
): GameSetupStepResult => ({ status: "skipped", code, params });

export const done = (
  code: string,
  params?: GameSetupStepResult["params"]
): GameSetupStepResult => ({ status: "done", code, params });

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
      // A full run covers any single step asked for meanwhile.
      waiting.steps =
        waiting.steps && request.steps
          ? [...new Set([...waiting.steps, ...request.steps])]
          : undefined;
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
    const gameKey = levelKeys.game(shop, objectId);
    const created = await this.createContext(shop, objectId, request);

    if ("skipped" in created) {
      if (created.skipped) {
        await updateGameRecord(gameKey, {
          setupLog: {
            lastRunAt: new Date().toISOString(),
            reason: request.reason,
            skipped: created.skipped,
            steps: [],
          },
        });
      }
      this.sendStatus(shop, objectId, "skipped");
      return;
    }

    const context = created;
    const steps = request.steps
      ? this.steps.filter((step) => request.steps!.includes(step.id))
      : this.steps;

    logger.info("[GameSetup] Running setup", {
      gameKey: context.gameKey,
      reason: context.reason,
      force: context.force,
      steps: steps.map((step) => step.id),
    });

    this.sendStatus(shop, objectId, "running");
    let failed = false;
    const entries: GameSetupLogEntry[] = [];

    for (const step of steps) {
      this.sendStatus(shop, objectId, "running", step.id);
      const startedAt = Date.now();
      const base = {
        stepId: step.id,
        reason: context.reason,
        at: new Date(startedAt).toISOString(),
      };

      try {
        const result = (await step.run(context)) ?? done("done");
        entries.push({
          ...base,
          status: result.status,
          code: result.code,
          ...(result.params ? { params: result.params } : {}),
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        failed = true;
        logger.error(`[GameSetup] Step "${step.id}" failed`, {
          gameKey: context.gameKey,
          error,
        });
        entries.push({
          ...base,
          status: "failed",
          code: null,
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startedAt,
        });
      }

      const refreshed = await gamesSublevel.get(context.gameKey);
      if (refreshed) context.game = refreshed;
    }

    const order = new Map(this.steps.map((step, index) => [step.id, index]));
    await updateGameRecord(context.gameKey, (game) => {
      const kept = (game.setupLog?.steps ?? []).filter(
        (entry) =>
          order.has(entry.stepId) &&
          !entries.some((item) => item.stepId === entry.stepId)
      );
      return {
        setupLog: {
          lastRunAt: new Date().toISOString(),
          reason: context.reason,
          skipped: null,
          steps: [...kept, ...entries].sort(
            (a, b) => order.get(a.stepId)! - order.get(b.stepId)!
          ),
        },
      };
    });

    this.sendStatus(shop, objectId, failed ? "failed" : "completed");
    WindowManager.sendToAppWindows("on-library-batch-complete");
  }

  private static async createContext(
    shop: GameShop,
    objectId: string,
    request: GameSetupRequest
  ): Promise<GameSetupContext | { skipped: GameSetupSkipReason | null }> {
    const gameKey = levelKeys.game(shop, objectId);
    const game = await gamesSublevel.get(gameKey);

    if (!game || game.isDeleted) return { skipped: null };
    if (!game.executablePath) return { skipped: "no-executable" };
    // Hydra does not own the files of games managed by another launcher.
    if (game.hasActiveSteamImport || game.epicInstallation) {
      return { skipped: "other-launcher" };
    }

    const executablePath = parseExecutablePath(game.executablePath);
    // Steam installs run through Steam with Steam's own prefix.
    if (/[\\/]steamapps[\\/]common[\\/]/i.test(executablePath)) {
      return { skipped: "steam-install" };
    }

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
        ? (
            await resolveGameProton(
              game,
              (
                await getLaunchAdditions({
                  objectId,
                  gameKey,
                  game,
                  executablePath,
                  userPreferences,
                  prepareMissing: false,
                })
              ).protonPath
            )
          ).path
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
