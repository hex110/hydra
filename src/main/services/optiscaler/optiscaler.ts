import fs from "node:fs";
import path from "node:path";
import { db, gamesSublevel, levelKeys } from "@main/level";
import { parseExecutablePath } from "@main/events/helpers/parse-executable-path";
import { logger } from "@main/services/logger";
import { updateGameRecord } from "@main/services/game-record-updater";
import { WindowManager } from "@main/services/window-manager";
import {
  compareOptiScalerVersions,
  evaluateOptiScalerEligibility,
  findOptiScalerCompatibilityEntry,
  getOptiScalerDllOverride,
  resolveOptiScalerSettings,
  type OptiScalerSettings,
} from "@shared";
import type {
  Game,
  GameOptiScalerInstallation,
  GameOptiScalerStatus,
  GameShop,
  OptiScalerBulkProgress,
  OptiScalerEligibility,
  OptiScalerOverview,
  UserPreferences,
} from "@types";
import {
  OPTISCALER_MANIFEST_FILE,
  findUpscalerLibraries,
  hasExternalOptiScaler,
  installOptiScaler,
  readOptiScalerManifest,
  resolveGameRootForDetection,
  resolveOptiScalerInstallDirectory,
  uninstallOptiScaler,
} from "./game-files";
import { OptiScalerAssets } from "./optiscaler-assets";

export type OptiScalerInstallError =
  | "not-found"
  | "not-windows-game"
  | "external-install"
  | "failed";

export class OptiScalerError extends Error {
  constructor(
    public readonly code: OptiScalerInstallError,
    message: string
  ) {
    super(message);
  }
}

const loadSettings = async (): Promise<OptiScalerSettings> =>
  resolveOptiScalerSettings(
    await db
      .get<string, UserPreferences | null>(levelKeys.userPreferences, {
        valueEncoding: "json",
      })
      .catch(() => null)
  );

const getWindowsExecutable = (game: Game) => {
  if (!game.executablePath) return null;
  const executablePath = parseExecutablePath(game.executablePath);
  return path.extname(executablePath).toLowerCase() === ".exe"
    ? executablePath
    : null;
};

/** Games whose files another launcher owns are never touched automatically. */
const isManagedElsewhere = (game: Game, executablePath: string) =>
  game.hasActiveSteamImport === true ||
  !!game.epicInstallation ||
  /[\\/]steamapps[\\/]common[\\/]/i.test(executablePath);

/**
 * Installs OptiScaler into games, keeps track of what it installed and tells
 * the launcher which DLL override a game needs under Wine.
 */
export class OptiScaler {
  private static bulkRun: Promise<void> | null = null;

  private static async getGame(shop: GameShop, objectId: string) {
    const game = await gamesSublevel.get(levelKeys.game(shop, objectId));
    if (!game || game.isDeleted) {
      throw new OptiScalerError("not-found", "Game not found");
    }
    return game;
  }

  private static updateGame(
    shop: GameShop,
    objectId: string,
    changes: Partial<Game>
  ) {
    return updateGameRecord(levelKeys.game(shop, objectId), changes);
  }

  private static async evaluate(
    game: Game,
    installDirectory: string,
    settings: OptiScalerSettings
  ): Promise<OptiScalerEligibility> {
    const manifest = await readOptiScalerManifest(installDirectory);
    const ignored = new Set(
      (manifest?.files ?? []).map((file) =>
        path.resolve(installDirectory, file)
      )
    );

    const [upscalerLibraries, compatibilityList] = await Promise.all([
      findUpscalerLibraries(
        resolveGameRootForDetection(installDirectory),
        ignored
      ),
      settings.useCompatibilityList
        ? OptiScalerAssets.getCompatibilityList()
        : Promise.resolve([]),
    ]);

    return evaluateOptiScalerEligibility(
      settings,
      upscalerLibraries,
      findOptiScalerCompatibilityEntry(compatibilityList, game.title)
    );
  }

  public static async getGameStatus(
    shop: GameShop,
    objectId: string
  ): Promise<GameOptiScalerStatus> {
    const game = await this.getGame(shop, objectId);
    const settings = await loadSettings();
    const executablePath = getWindowsExecutable(game);
    const latestVersion =
      (await OptiScalerAssets.getLatestRelease(settings.channel))?.version ??
      null;

    if (!executablePath) {
      return {
        installDirectory: null,
        installation: null,
        externallyManaged: false,
        eligibility: null,
        autoInstallDisabled: game.optiScalerAutoInstallDisabled === true,
        latestVersion,
      };
    }

    const installDirectory =
      game.optiScaler?.directory ??
      (await resolveOptiScalerInstallDirectory(executablePath));
    const manifest = await readOptiScalerManifest(installDirectory);

    // The files were removed outside Hydra; forget the installation.
    if (game.optiScaler && !manifest) {
      await this.updateGame(shop, objectId, { optiScaler: null });
    }

    return {
      installDirectory,
      installation: manifest ? (game.optiScaler ?? null) : null,
      externallyManaged: await hasExternalOptiScaler(installDirectory),
      eligibility: await this.evaluate(game, installDirectory, settings),
      autoInstallDisabled: game.optiScalerAutoInstallDisabled === true,
      latestVersion,
    };
  }

  public static async install(
    shop: GameShop,
    objectId: string
  ): Promise<GameOptiScalerInstallation> {
    const game = await this.getGame(shop, objectId);
    const executablePath = getWindowsExecutable(game);
    if (!executablePath) {
      throw new OptiScalerError(
        "not-windows-game",
        "OptiScaler only works with Windows games"
      );
    }

    const installDirectory =
      game.optiScaler?.directory ??
      (await resolveOptiScalerInstallDirectory(executablePath));
    if (await hasExternalOptiScaler(installDirectory)) {
      throw new OptiScalerError(
        "external-install",
        "OptiScaler was installed in this game by another tool"
      );
    }

    const settings = await loadSettings();
    const compatibility = settings.installOptiPatcher
      ? findOptiScalerCompatibilityEntry(
          await OptiScalerAssets.getCompatibilityList(),
          game.title
        )
      : null;

    try {
      const release = await OptiScalerAssets.ensureRelease(settings.channel);
      const optiPatcher = compatibility?.optiPatcherSupported
        ? await OptiScalerAssets.ensureOptiPatcher()
        : null;
      const proxyDll = game.optiScalerProxyDll ?? settings.proxyDll;

      const manifest = await installOptiScaler({
        releaseDirectory: release.directory,
        installDirectory,
        version: release.version,
        channel: settings.channel,
        proxyDll,
        iniOverrides: settings.iniOverrides,
        optiPatcher,
      });

      const installation: GameOptiScalerInstallation = {
        directory: installDirectory,
        version: manifest.version,
        proxyDll,
        installedAt: manifest.installedAt,
      };

      await this.updateGame(shop, objectId, { optiScaler: installation });
      logger.info("[OptiScaler] Installed", {
        gameKey: levelKeys.game(shop, objectId),
        ...installation,
        optiPatcher: manifest.optiPatcherVersion,
      });

      return installation;
    } catch (error) {
      if (error instanceof OptiScalerError) throw error;
      logger.error("[OptiScaler] Install failed", {
        gameKey: levelKeys.game(shop, objectId),
        error,
      });
      throw new OptiScalerError(
        "failed",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /** Removes OptiScaler and stops it from being installed again automatically. */
  public static async uninstall(shop: GameShop, objectId: string) {
    const game = await this.getGame(shop, objectId);
    const executablePath = getWindowsExecutable(game);
    const installDirectory =
      game.optiScaler?.directory ??
      (executablePath
        ? await resolveOptiScalerInstallDirectory(executablePath)
        : null);

    if (installDirectory) await uninstallOptiScaler(installDirectory);

    await this.updateGame(shop, objectId, {
      optiScaler: null,
      optiScalerAutoInstallDisabled: true,
    });
  }

  public static async setAutoInstallDisabled(
    shop: GameShop,
    objectId: string,
    disabled: boolean
  ) {
    await this.updateGame(shop, objectId, {
      optiScalerAutoInstallDisabled: disabled,
    });
  }

  /** Installs OptiScaler into a newly set up game when the user opted in and it qualifies. */
  public static async installIfEligible(
    game: Game,
    options: { ignoreAutoInstallSetting?: boolean } = {}
  ): Promise<boolean> {
    const settings = await loadSettings();
    if (!settings.autoInstall && !options.ignoreAutoInstallSetting) {
      return false;
    }
    if (game.optiScaler || game.optiScalerAutoInstallDisabled) return false;

    const executablePath = getWindowsExecutable(game);
    if (!executablePath || isManagedElsewhere(game, executablePath)) {
      return false;
    }

    const installDirectory =
      await resolveOptiScalerInstallDirectory(executablePath);
    if (await hasExternalOptiScaler(installDirectory)) return false;

    const eligibility = await this.evaluate(game, installDirectory, settings);
    if (!eligibility.eligible) return false;

    logger.info("[OptiScaler] Game qualifies for OptiScaler", {
      title: game.title,
      reasons: eligibility.reasons,
    });

    await this.install(game.shop, game.objectId);
    return true;
  }

  private static async listLibraryGames() {
    return (await gamesSublevel.values().all()).filter(
      (game) => !game.isDeleted && game.executablePath
    );
  }

  public static async getOverview(): Promise<OptiScalerOverview> {
    const settings = await loadSettings();
    const [latest, cachedVersions, cacheSize, compatibility, games] =
      await Promise.all([
        OptiScalerAssets.getLatestRelease(settings.channel),
        OptiScalerAssets.getCachedVersions(settings.channel),
        OptiScalerAssets.getCacheSize(),
        // Fetches the list the first time so its size is known.
        OptiScalerAssets.getCompatibilityList().then(() =>
          OptiScalerAssets.getCompatibilityListInfo()
        ),
        this.listLibraryGames(),
      ]);

    const installed = games.filter((game) => game.optiScaler);

    return {
      latestVersion: latest?.version ?? null,
      cachedVersions,
      cacheSizeInBytes: cacheSize,
      lastCheckedAt: latest ? new Date(latest.checkedAt).toISOString() : null,
      compatibilityListUpdatedAt: compatibility.fetchedAt,
      compatibilityListSize: compatibility.size,
      installedGames: installed.length,
      outdatedGames: latest
        ? installed.filter(
            (game) =>
              compareOptiScalerVersions(
                game.optiScaler!.version,
                latest.version
              ) < 0
          ).length
        : 0,
    };
  }

  public static async checkForUpdates() {
    const settings = await loadSettings();
    await Promise.all([
      OptiScalerAssets.getLatestRelease(settings.channel, true),
      OptiScalerAssets.getCompatibilityList(true),
    ]);
  }

  public static async downloadLatest() {
    const settings = await loadSettings();
    return OptiScalerAssets.ensureRelease(settings.channel);
  }

  public static clearCache() {
    return OptiScalerAssets.clearCache();
  }

  private static sendBulkProgress(progress: OptiScalerBulkProgress) {
    WindowManager.sendToAppWindows("on-optiscaler-bulk-progress", progress);
  }

  /**
   * Installs into every qualifying library game, or updates every game with
   * an older Hydra-installed version. Runs in the background and reports
   * progress; returns false when a run is already in progress.
   */
  public static runBulk(mode: "install-eligible" | "update-installed") {
    if (this.bulkRun) return false;

    this.bulkRun = this.bulk(mode)
      .catch((error) => logger.error("[OptiScaler] Bulk run failed", error))
      .finally(() => {
        this.bulkRun = null;
        WindowManager.sendToAppWindows("on-library-batch-complete");
      });

    return true;
  }

  private static async bulk(mode: "install-eligible" | "update-installed") {
    const settings = await loadSettings();
    const latest = await OptiScalerAssets.getLatestRelease(settings.channel);
    const games = (await this.listLibraryGames()).filter((game) =>
      mode === "update-installed"
        ? game.optiScaler &&
          latest &&
          compareOptiScalerVersions(game.optiScaler.version, latest.version) < 0
        : !game.optiScaler && !game.optiScalerAutoInstallDisabled
    );

    const progress: OptiScalerBulkProgress = {
      status: "running",
      processed: 0,
      total: games.length,
      installed: 0,
      failed: 0,
    };
    this.sendBulkProgress(progress);

    for (const game of games) {
      try {
        const installed =
          mode === "update-installed"
            ? (await this.install(game.shop, game.objectId), true)
            : await this.installIfEligible(game, {
                ignoreAutoInstallSetting: true,
              });
        if (installed) progress.installed++;
      } catch (error) {
        progress.failed++;
        logger.warn("[OptiScaler] Bulk install skipped a game", {
          title: game.title,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      progress.processed++;
      this.sendBulkProgress(progress);
    }

    this.sendBulkProgress({ ...progress, status: "completed" });
  }

  /** The WINEDLLOVERRIDES entry a game needs, or null when OptiScaler is not installed. */
  public static getLaunchDllOverride(game: Game | null | undefined) {
    if (!game?.optiScaler) return null;
    const manifestPath = path.join(
      game.optiScaler.directory,
      OPTISCALER_MANIFEST_FILE
    );
    return fs.existsSync(manifestPath)
      ? getOptiScalerDllOverride(game.optiScaler.proxyDll)
      : null;
  }
}
