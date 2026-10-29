import fs from "node:fs";
import path from "node:path";
import { db, gamesSublevel, levelKeys } from "@main/level";
import {
  getWindowsExecutable,
  isManagedElsewhere,
} from "@main/helpers/windows-game";
import { logger } from "@main/services/logger";
import { updateGameRecord } from "@main/services/game-record-updater";
import { WindowManager } from "@main/services/window-manager";
import {
  HDR_LAUNCH_RULE_ID,
  HYPRLAND_HDR_LAUNCH_RULE_ID,
  RENODX_MANIFEST_FILE,
  chooseReShadeProxyDll,
  chooseRenoDxMod,
  compareVersions,
  findRenoDxGame,
  isRenoDxModChoice,
  resolveReShadeIniOverrides,
  resolveRenoDxSettings,
  type RenoDxSettings,
} from "@shared";
import type {
  Game,
  GameRenoDxInstallation,
  GameRenoDxStatus,
  GameShop,
  RenoDxAutoInstallOutcome,
  RenoDxBulkMode,
  RenoDxBulkProgress,
  RenoDxModChoice,
  RenoDxOverview,
  RenoDxProxyConflict,
  RenoDxUnavailableReason,
  UserPreferences,
} from "@types";
import { detectGameGraphics } from "../graphics/graphics-api";
import { resolveOptiScalerInstallDirectory } from "../optiscaler/game-files";
import { findExistingProxyDlls } from "../reshade/foreign-dll";
import { ReShadeAssets } from "../reshade/reshade-assets";
import {
  findMissingRenoDxFiles,
  hasExternalRenoDx,
  installRenoDx,
  readRenoDxManifest,
  uninstallRenoDx,
} from "./game-files";
import { RenoDxAssets } from "./renodx-assets";

export type RenoDxInstallError =
  | "not-found"
  | "not-windows-game"
  | "external-install"
  | "conflict"
  | "failed"
  | RenoDxUnavailableReason;

export class RenoDxError extends Error {
  constructor(
    public readonly code: RenoDxInstallError,
    message: string,
    public readonly conflict?: RenoDxProxyConflict
  ) {
    super(message);
  }
}

const loadPreferences = () =>
  db
    .get<string, UserPreferences | null>(levelKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);

/** Unreal games start from a bootstrap executable; the game itself is the -Shipping one. */
const resolveGameBinary = async (
  executablePath: string,
  installDirectory: string
) => {
  if (
    path.resolve(installDirectory) ===
    path.resolve(path.dirname(executablePath))
  ) {
    return executablePath;
  }
  const names = await fs.promises.readdir(installDirectory).catch(() => []);
  const shipping = names.find((name) => /-shipping\.exe$/i.test(name));
  return shipping ? path.join(installDirectory, shipping) : executablePath;
};

const isCommandAvailable = (command: string) =>
  (process.env.PATH ?? "").split(path.delimiter).some((directory) => {
    try {
      fs.accessSync(path.join(directory, command), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });

/** RenoDX needs HDR from the compositor on Hyprland, and `hypr-hdr` to ask for it. */
const canSwitchMonitorToHdr = () =>
  process.platform === "linux" &&
  !!process.env.HYPRLAND_INSTANCE_SIGNATURE &&
  isCommandAvailable("hypr-hdr");

interface Plan {
  game: Game;
  executablePath: string;
  installDirectory: string;
  /** Null when the catalogue has no usable mod; see `unavailable`. */
  choice: RenoDxModChoice | null;
  unavailable: RenoDxUnavailableReason | null;
  /** The DLL ReShade loads as; null when OptiScaler loads it or none fits. */
  proxyDll: GameRenoDxInstallation["proxyDll"];
  conflict: RenoDxProxyConflict | null;
  architecture: "x64" | "x86";
}

/**
 * Installs ReShade and RenoDX's HDR add-ons into games, keeps track of what it
 * installed and tells the launcher which DLL override a game needs under Wine.
 */
export class RenoDx {
  private static bulkRun: Promise<void> | null = null;

  private static async getGame(shop: GameShop, objectId: string) {
    const game = await gamesSublevel.get(levelKeys.game(shop, objectId));
    if (!game || game.isDeleted) {
      throw new RenoDxError("not-found", "Game not found");
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

  /**
   * Works out what an install would do for a game: which mod, which DLL
   * name, and anything in the way. Reads the game folder and the catalogue.
   */
  private static async plan(
    game: Game,
    settings: RenoDxSettings
  ): Promise<Plan | { unavailable: RenoDxUnavailableReason }> {
    const executablePath = getWindowsExecutable(game);
    if (!executablePath) return { unavailable: "not-windows" };

    const installDirectory =
      game.renoDx?.directory ??
      (await resolveOptiScalerInstallDirectory(executablePath));
    const graphics = await detectGameGraphics(
      await resolveGameBinary(executablePath, installDirectory)
    ).catch(() => null);
    const architecture = graphics?.architecture === "x86" ? "x86" : "x64";

    const catalogue = await RenoDxAssets.getCatalogue();
    const entry = catalogue
      ? findRenoDxGame(catalogue.games, {
          steamAppId:
            game.shop === "steam" && /^\d+$/.test(game.objectId)
              ? Number(game.objectId)
              : null,
          title: game.title,
        })
      : null;

    const result = entry
      ? chooseRenoDxMod(entry, {
          architecture: graphics?.architecture
            ? graphics.architecture === "x86"
              ? "x86"
              : "x64"
            : null,
          includePrerelease: settings.includePrerelease,
        })
      : {
          reason: (catalogue
            ? "no-mod"
            : "no-catalogue") as RenoDxUnavailableReason,
        };

    const choice = isRenoDxModChoice(result) ? result : null;
    const base = {
      game,
      executablePath,
      installDirectory,
      choice,
      unavailable: isRenoDxModChoice(result) ? null : result.reason,
      architecture,
    } as const;

    const apiProxy = chooseReShadeProxyDll(graphics?.apis ?? null);
    if (!apiProxy) {
      return {
        ...base,
        unavailable: base.unavailable ?? "unsupported-api",
        proxyDll: null,
        conflict: null,
      };
    }

    const manifest = await readRenoDxManifest(installDirectory);
    const [existing] = await findExistingProxyDlls(
      installDirectory,
      [apiProxy],
      new Set(manifest?.files ?? [])
    );

    // OptiScaler holding the name is not a conflict: it can load ReShade.
    if (existing?.kind === "optiscaler") {
      return { ...base, proxyDll: null, conflict: null };
    }
    return {
      ...base,
      proxyDll: apiProxy,
      conflict: existing
        ? { fileName: existing.fileName, kind: existing.kind }
        : null,
    };
  }

  public static async getGameStatus(
    shop: GameShop,
    objectId: string
  ): Promise<GameRenoDxStatus> {
    const game = await this.getGame(shop, objectId);
    const settings = resolveRenoDxSettings(await loadPreferences());
    const latestReShade = (await ReShadeAssets.getLatest())?.version ?? null;

    const plan = await this.plan(game, settings);

    if (!("installDirectory" in plan)) {
      return {
        installDirectory: null,
        installation: null,
        mod: null,
        unavailable: plan.unavailable,
        proxyDll: null,
        conflict: null,
        externallyManaged: false,
        missingFiles: [],
        autoInstallDisabled: game.renoDxAutoInstallDisabled === true,
        updateAvailable: false,
        latestReShadeVersion: latestReShade,
      };
    }

    const manifest = await readRenoDxManifest(plan.installDirectory);
    // The files were removed outside Hydra; forget the installation.
    if (game.renoDx && !manifest) {
      await this.updateGame(shop, objectId, { renoDx: null });
    }
    const installation = manifest ? (game.renoDx ?? null) : null;

    return {
      installDirectory: plan.installDirectory,
      installation,
      mod: plan.choice
        ? {
            title: plan.choice.mod.title,
            variant: plan.choice.mod.variant,
            status: plan.choice.mod.status,
            notes: plan.choice.mod.notes,
            addonFile: plan.choice.artifact.name,
          }
        : null,
      unavailable: plan.unavailable,
      proxyDll: plan.proxyDll,
      conflict: plan.conflict,
      externallyManaged: await hasExternalRenoDx(plan.installDirectory),
      missingFiles: manifest
        ? await findMissingRenoDxFiles(plan.installDirectory, manifest)
        : [],
      autoInstallDisabled: game.renoDxAutoInstallDisabled === true,
      updateAvailable:
        !!installation &&
        (await this.hasUpdate(installation, plan.choice, latestReShade)),
      latestReShadeVersion: latestReShade,
    };
  }

  private static async hasUpdate(
    installation: GameRenoDxInstallation,
    choice: RenoDxModChoice | null,
    latestReShade: string | null
  ) {
    if (
      latestReShade &&
      compareVersions(installation.reShadeVersion, latestReShade) < 0
    ) {
      return true;
    }
    if (!choice) return false;
    const remote = await RenoDxAssets.getRemoteVersion(choice.artifact);
    return !!remote && remote !== installation.addonVersion;
  }

  /** Installs the newest ReShade and the game's add-on over whatever Hydra installed before. */
  public static async install(
    shop: GameShop,
    objectId: string
  ): Promise<GameRenoDxInstallation> {
    const game = await this.getGame(shop, objectId);
    const preferences = await loadPreferences();
    const settings = resolveRenoDxSettings(preferences);

    const plan = await this.plan(game, settings);
    if (!("installDirectory" in plan)) {
      throw new RenoDxError(
        "not-windows-game",
        "RenoDX only works with Windows games"
      );
    }
    if (!plan.choice) {
      throw new RenoDxError(
        plan.unavailable ?? "no-mod",
        `No RenoDX mod can be installed for ${game.title}`
      );
    }
    if (plan.unavailable === "unsupported-api") {
      throw new RenoDxError(
        "unsupported-api",
        "The game only renders through Vulkan"
      );
    }
    if (await hasExternalRenoDx(plan.installDirectory)) {
      throw new RenoDxError(
        "external-install",
        "RenoDX was installed in this game by another tool"
      );
    }
    if (plan.conflict) {
      throw new RenoDxError(
        plan.conflict.kind === "reshade" ? "external-install" : "conflict",
        `${plan.conflict.fileName} is already in the game folder`,
        plan.conflict
      );
    }

    const { choice } = plan;
    try {
      const reShade = await ReShadeAssets.ensure();
      const addon = await RenoDxAssets.ensureAddOn(choice.artifact);

      const manifest = await installRenoDx({
        installDirectory: plan.installDirectory,
        reShadeDirectory: reShade.directory,
        reShadeVersion: reShade.version,
        architecture: plan.architecture,
        proxyDll: plan.proxyDll,
        addon: {
          file: addon.file,
          name: choice.artifact.name,
          version: addon.version,
        },
        modId: choice.mod.id,
        iniOverrides: resolveReShadeIniOverrides(preferences),
      });

      const installation: GameRenoDxInstallation = {
        directory: plan.installDirectory,
        modId: choice.mod.id,
        modTitle: choice.mod.title,
        reShadeVersion: manifest.reShadeVersion,
        addonVersion: manifest.addonVersion,
        proxyDll: plan.proxyDll,
        installedAt: manifest.installedAt,
      };

      await this.updateGame(shop, objectId, { renoDx: installation });
      if (settings.enableHdrRules) await this.enableHdrRules(game);

      logger.info("[RenoDX] Installed", {
        gameKey: levelKeys.game(shop, objectId),
        ...installation,
      });
      return installation;
    } catch (error) {
      if (error instanceof RenoDxError) throw error;
      logger.error("[RenoDX] Install failed", {
        gameKey: levelKeys.game(shop, objectId),
        error,
      });
      throw new RenoDxError(
        "failed",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * RenoDX only gets HDR from a monitor already in HDR (see the HDR rules in
   * the launch rules docs). Turns on the built-in HDR rule for the game, and
   * the monitor switch where `hypr-hdr` is there to do it.
   */
  private static async enableHdrRules(game: Game) {
    const overrides = { ...game.launchRuleOverrides };
    overrides[HDR_LAUNCH_RULE_ID] ??= true;
    if (canSwitchMonitorToHdr()) {
      overrides[HYPRLAND_HDR_LAUNCH_RULE_ID] ??= true;
    }
    await this.updateGame(game.shop, game.objectId, {
      launchRuleOverrides: overrides,
    });
  }

  /** Removes the files and stops them from being installed again automatically. */
  public static async uninstall(shop: GameShop, objectId: string) {
    const game = await this.getGame(shop, objectId);
    const executablePath = getWindowsExecutable(game);
    const installDirectory =
      game.renoDx?.directory ??
      (executablePath
        ? await resolveOptiScalerInstallDirectory(executablePath)
        : null);

    if (installDirectory) await uninstallRenoDx(installDirectory);

    await this.updateGame(shop, objectId, {
      renoDx: null,
      renoDxAutoInstallDisabled: true,
    });
  }

  public static async setAutoInstallDisabled(
    shop: GameShop,
    objectId: string,
    disabled: boolean
  ) {
    await this.updateGame(shop, objectId, {
      renoDxAutoInstallDisabled: disabled,
    });
  }

  /** Installs RenoDX when a mod exists for the game; returns why it did or did not. */
  public static async installIfSupported(
    game: Game,
    options: { ignoreAutoInstallSetting?: boolean } = {}
  ): Promise<RenoDxAutoInstallOutcome> {
    const preferences = await loadPreferences();
    const settings = resolveRenoDxSettings(preferences);
    if (!settings.autoInstall && !options.ignoreAutoInstallSetting) {
      return "auto-install-off";
    }
    if (game.renoDx) return "already-installed";
    if (game.renoDxAutoInstallDisabled) return "opted-out";

    const executablePath = getWindowsExecutable(game);
    if (!executablePath) return "not-windows";
    if (isManagedElsewhere(game, executablePath)) return "other-launcher";

    const plan = await this.plan(game, settings);
    if (!("installDirectory" in plan)) return plan.unavailable;
    if (!plan.choice) return plan.unavailable ?? "no-mod";
    if (plan.unavailable) return plan.unavailable;
    if (await hasExternalRenoDx(plan.installDirectory)) return "external";
    if (plan.conflict) {
      return plan.conflict.kind === "reshade" ? "external" : "conflict";
    }

    await this.install(game.shop, game.objectId);
    return "installed";
  }

  private static async listLibraryGames() {
    return (await gamesSublevel.values().all()).filter(
      (game) => !game.isDeleted && game.executablePath
    );
  }

  public static async getOverview(): Promise<RenoDxOverview> {
    const [catalogue, latest, games, cacheSize] = await Promise.all([
      RenoDxAssets.getCatalogue(),
      ReShadeAssets.getLatest(),
      this.listLibraryGames(),
      Promise.all([RenoDxAssets.getCacheSize(), ReShadeAssets.getCacheSize()]),
    ]);
    const installed = games.filter((game) => game.renoDx);

    return {
      catalogueGames: catalogue?.games.length ?? 0,
      catalogueUpdatedAt: catalogue
        ? new Date(catalogue.fetchedAt).toISOString()
        : null,
      latestReShadeVersion: latest?.version ?? null,
      installedGames: installed.length,
      outdatedGames: latest
        ? installed.filter(
            (game) =>
              compareVersions(game.renoDx!.reShadeVersion, latest.version) < 0
          ).length
        : 0,
      cacheSizeInBytes: cacheSize[0] + cacheSize[1],
    };
  }

  public static async checkForUpdates() {
    await Promise.all([
      RenoDxAssets.getCatalogue(true),
      ReShadeAssets.getLatest(true),
    ]);
  }

  public static async clearCache() {
    await Promise.all([RenoDxAssets.clearCache(), ReShadeAssets.clearCache()]);
  }

  /** The DLL (without ".dll") Wine must load natively, or null when RenoDX is not installed that way. */
  public static getLaunchNativeDll(game: Game | null | undefined) {
    const installation = game?.renoDx;
    if (!installation?.proxyDll) return null;
    return fs.existsSync(
      path.join(installation.directory, RENODX_MANIFEST_FILE)
    )
      ? installation.proxyDll.replace(/\.dll$/i, "")
      : null;
  }

  private static sendBulkProgress(progress: RenoDxBulkProgress) {
    WindowManager.sendToAppWindows("on-renodx-bulk-progress", progress);
  }

  /**
   * Installs into every library game that has a mod, or updates every game
   * that has RenoDX. Runs in the background and reports progress; returns
   * false when a run is already in progress.
   */
  public static runBulk(mode: RenoDxBulkMode) {
    if (this.bulkRun) return false;

    this.bulkRun = this.bulk(mode)
      .catch((error) => logger.error("[RenoDX] Bulk run failed", error))
      .finally(() => {
        this.bulkRun = null;
        WindowManager.sendToAppWindows("on-library-batch-complete");
      });

    return true;
  }

  private static async bulk(mode: RenoDxBulkMode) {
    const games = (await this.listLibraryGames()).filter((game) =>
      mode === "update-installed"
        ? game.renoDx
        : !game.renoDx && !game.renoDxAutoInstallDisabled
    );

    const progress: RenoDxBulkProgress = {
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
            : (await this.installIfSupported(game, {
                ignoreAutoInstallSetting: true,
              })) === "installed";
        if (installed) progress.installed++;
      } catch (error) {
        progress.failed++;
        logger.warn("[RenoDX] Bulk install skipped a game", {
          title: game.title,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      progress.processed++;
      this.sendBulkProgress(progress);
    }

    this.sendBulkProgress({ ...progress, status: "completed" });
  }
}
