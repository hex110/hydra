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
  resolveOptiScalerSettings,
  type OptiScalerSettings,
} from "@shared";
import type {
  Game,
  GameOptiScalerInstallation,
  GameOptiScalerStatus,
  GameShop,
  OptiScalerBulkProgress,
  OptiScalerChannel,
  OptiScalerAutoInstallOutcome,
  OptiScalerEligibility,
  OptiScalerOverview,
  UserPreferences,
} from "@types";
import {
  OPTISCALER_MANIFEST_FILE,
  findMissingOptiScalerFiles,
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

export type OptiScalerLaunchCheck =
  | { repaired: true; missingFiles: string[]; version: string }
  | {
      repaired: false;
      missingFiles: string[];
      reason: "wrapper" | "not-downloaded" | "failed";
    };

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
  ): Promise<Omit<GameOptiScalerStatus, "conflictingWrappers">> {
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
        missingFiles: [],
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
      missingFiles: manifest
        ? await findMissingOptiScalerFiles(installDirectory, manifest)
        : [],
      eligibility: await this.evaluate(game, installDirectory, settings),
      autoInstallDisabled: game.optiScalerAutoInstallDisabled === true,
      latestVersion,
    };
  }

  /**
   * Installs the newest release, or `version` when it is downloaded already.
   * `channel` defaults to the release channel in settings.
   */
  public static async install(
    shop: GameShop,
    objectId: string,
    version?: string,
    channel?: OptiScalerChannel
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

    const releaseChannel = channel ?? settings.channel;

    try {
      const release = version
        ? await OptiScalerAssets.getCachedRelease(releaseChannel, version)
        : await OptiScalerAssets.ensureRelease(releaseChannel);
      const optiPatcher = compatibility?.optiPatcherSupported
        ? await OptiScalerAssets.ensureOptiPatcher()
        : null;
      const proxyDll = game.optiScalerProxyDll ?? settings.proxyDll;

      const manifest = await installOptiScaler({
        releaseDirectory: release.directory,
        installDirectory,
        version: release.version,
        channel: releaseChannel,
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

  /**
   * Reinstalls a Hydra installation whose files were removed outside Hydra,
   * from the same cached release. Returns null when nothing is missing.
   */
  public static async checkFilesBeforeLaunch(
    game: Game,
    conflictingWrappers: string[]
  ): Promise<OptiScalerLaunchCheck | null> {
    if (!game.optiScaler) return null;
    const { directory } = game.optiScaler;
    const manifest = await readOptiScalerManifest(directory);
    if (!manifest) return null;

    const missingFiles = await findMissingOptiScalerFiles(directory, manifest);
    if (missingFiles.length === 0) return null;

    const gameKey = levelKeys.game(game.shop, game.objectId);
    logger.warn("[OptiScaler] Files were removed outside Hydra", {
      gameKey,
      missingFiles,
      conflictingWrappers,
    });

    // The wrapper runs after this check and would delete them again.
    if (conflictingWrappers.length > 0) {
      return { repaired: false, missingFiles, reason: "wrapper" };
    }

    const cached = await OptiScalerAssets.getCachedVersions(manifest.channel);
    if (!cached.includes(manifest.version)) {
      return { repaired: false, missingFiles, reason: "not-downloaded" };
    }

    try {
      await this.install(
        game.shop,
        game.objectId,
        manifest.version,
        manifest.channel
      );
      return { repaired: true, missingFiles, version: manifest.version };
    } catch (error) {
      logger.error("[OptiScaler] Could not restore removed files", {
        gameKey,
        error,
      });
      return { repaired: false, missingFiles, reason: "failed" };
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
  /** Installs OptiScaler when the game qualifies; returns why it did or did not. */
  public static async installIfEligible(
    game: Game,
    options: { ignoreAutoInstallSetting?: boolean } = {}
  ): Promise<OptiScalerAutoInstallOutcome> {
    const settings = await loadSettings();
    if (!settings.autoInstall && !options.ignoreAutoInstallSetting) {
      return "auto-install-off";
    }
    if (game.optiScaler) return "already-installed";
    if (game.optiScalerAutoInstallDisabled) return "opted-out";

    const executablePath = getWindowsExecutable(game);
    if (!executablePath) return "not-windows";
    if (isManagedElsewhere(game, executablePath)) return "other-launcher";

    const installDirectory =
      await resolveOptiScalerInstallDirectory(executablePath);
    if (await hasExternalOptiScaler(installDirectory)) return "external";

    const eligibility = await this.evaluate(game, installDirectory, settings);
    if (!eligibility.eligible) {
      return eligibility.blocked ? "blocked" : "not-eligible";
    }

    logger.info("[OptiScaler] Game qualifies for OptiScaler", {
      title: game.title,
      reasons: eligibility.reasons,
    });

    await this.install(game.shop, game.objectId);
    return "installed";
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
            : (await this.installIfEligible(game, {
                ignoreAutoInstallSetting: true,
              })) === "installed";
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

  /** The proxy DLL (without ".dll") Wine must load natively, or null when OptiScaler is not installed. */
  public static getLaunchNativeDll(game: Game | null | undefined) {
    if (!game?.optiScaler) return null;
    const manifestPath = path.join(
      game.optiScaler.directory,
      OPTISCALER_MANIFEST_FILE
    );
    return fs.existsSync(manifestPath)
      ? game.optiScaler.proxyDll.replace(/\.dll$/i, "")
      : null;
  }
}
