import path from "node:path";
import { logger } from "@main/services/logger";
import { Wine } from "@main/services/wine";
import { OptiScaler } from "@main/services/optiscaler/optiscaler";
import {
  getMachineProfile,
  mayHaveHdrDisplay,
} from "@main/services/machine/machine-profile";
import { RenoDx, canSwitchMonitorToHdr } from "@main/services/renodx/renodx";
import { prepareOnlineFixGame } from "@main/services/game-setup/online-fix-step";
import { ModStore } from "@main/services/mods/mod-store";
import { WidescreenPatch } from "@main/services/widescreen-patch/widescreen-patch";
import { resolveGameRootForDetection } from "@main/services/optiscaler/game-files";
import {
  buildGamescopeLaunchOptions,
  isLaunchRuleApplied,
  getCapabilityOverride,
  isLaunchWrapperWanted,
  offloadLaunchOptions,
  resolveLaunchRules,
  resolveRenoDxSettings,
  withDependencyRuleOverrides,
  resolveInGameNotices,
} from "@shared";
import type {
  Game,
  GamescopeSettings,
  GameLaunchAdditions,
  GameLaunchRuleMatch,
  UserPreferences,
} from "@types";
import { applyDefaultLaunchOptions } from "./default-launch-options";
import { isGamemodeAvailable } from "./is-gamemode-available";
import { isMangohudAvailable } from "./is-mangohud-available";
import { buildLaunchEnvironment } from "./launch-environment";
import { findLaunchRuleMatches } from "./launch-rule-matching";
import { isGamescopeSession, withDisplayDefaults } from "./gamescope-display";
import { prepareMangoHudConfig } from "./mangohud-config";
import { InGameNotices } from "@main/services/in-game-notices";
import { resolveProtonChoice } from "./resolve-proton-path";

const isWindowsExecutable = (executablePath: string) =>
  path.extname(executablePath).toLowerCase() === ".exe";

/**
 * Proton's bridge to a running Linux Steam. Hydra launches games through umu
 * without Steam, so the bridge has nothing to talk to. Left on, Proton swaps
 * it in for any `steamclient64.dll` the game loads, which breaks the Steam
 * emulators and OnlineFix builds that ship their own. GE-Proton turns it off
 * for umu launches itself; Proton-CachyOS does not.
 */
const STEAM_BRIDGE_DLL = "lsteamclient";

/**
 * Environment Hydra adds when a Windows game runs under Proton: the DLL
 * overrides OptiScaler, RenoDX's ReShade, OnlineFix and a mod loader need to
 * load their proxy DLLs, and the
 * one that keeps Proton's Steam bridge out of the way.
 */
const getLinuxLaunchEnvironment = async (
  objectId: string,
  gameKey: string,
  game: Game | undefined,
  executablePath: string,
  userPreferences: UserPreferences | null,
  prepareMissing: boolean
) => {
  if (process.platform !== "linux" || !isWindowsExecutable(executablePath)) {
    return null;
  }

  const onlineFixEnabled =
    userPreferences?.prepareOnlineFixGames !== false &&
    game?.onlineFixDisabled !== true;
  let onlineFix = game?.onlineFix;
  if (onlineFix === undefined && onlineFixEnabled && prepareMissing) {
    // Games set up before OnlineFix handling existed are checked once here.
    onlineFix = await prepareOnlineFixGame({
      gameKey,
      executablePath,
      winePrefixPath: await Wine.resolvePrefixPath(
        Wine.getEffectivePrefixPath(game?.winePrefixPath, objectId)
      ),
    })
      .then((preparation) => preparation.detection)
      .catch((error) => {
        logger.error("Failed to prepare OnlineFix game", { gameKey, error });
        return null;
      });
  }

  const optiScalerDll = OptiScaler.getLaunchNativeDll(game);
  const renoDxDll = RenoDx.getLaunchNativeDll(game);
  const widescreenDll = WidescreenPatch.getLaunchNativeDll(game);
  // Play (modded) loads the loader's proxy DLL; Play leaves Wine's own.
  const modLoader = game
    ? await ModStore.getLaunchLoader(game.shop, objectId).catch(() => null)
    : null;

  return buildLaunchEnvironment({
    nativeDlls: [
      ...(optiScalerDll ? [optiScalerDll] : []),
      ...(renoDxDll ? [renoDxDll] : []),
      ...(widescreenDll ? [widescreenDll] : []),
      ...(modLoader?.nativeDlls ?? []),
      ...(onlineFixEnabled ? (onlineFix?.proxyDlls ?? []) : []),
    ],
    // The UnionCrax fix reaches Steam through the bridge, which is what makes
    // Steam list the player in Spacewar.
    disabledDlls:
      onlineFixEnabled && onlineFix?.steamBridge ? [] : [STEAM_BRIDGE_DLL],
  });
};

/**
 * Everything Hydra adds in front of a game's own launch options: its Linux
 * DLL overrides, then each launch rule that applies to the game. Later layers
 * win on conflicts.
 */
export const getLaunchAdditions = async ({
  objectId,
  gameKey,
  game,
  executablePath,
  userPreferences,
  prepareMissing = true,
}: {
  objectId: string;
  gameKey: string;
  game: Game | undefined;
  executablePath: string;
  userPreferences: UserPreferences | null;
  /** Run one-off preparation (OnlineFix) for games set up before it existed. */
  prepareMissing?: boolean;
}): Promise<GameLaunchAdditions> => {
  const rules = resolveLaunchRules(userPreferences?.launchRules);
  // Tools in the game can depend on rules, such as RenoDX on the HDR rules.
  const overrides = withDependencyRuleOverrides(game, {
    enableHdrRules:
      resolveRenoDxSettings(userPreferences).enableHdrRules &&
      mayHaveHdrDisplay(),
    canSwitchMonitor: canSwitchMonitorToHdr(),
  });

  const matches = await findLaunchRuleMatches(
    resolveGameRootForDetection(path.dirname(executablePath)),
    rules
  );

  const matchedRules: GameLaunchRuleMatch[] = rules
    .filter((rule) => rule.matchAllGames || matches.has(rule.id))
    .map((rule) => ({
      ruleId: rule.id,
      name: rule.name,
      matchedPath: matches.get(rule.id) ?? null,
      enabledByDefault: rule.enabled,
      override: game?.launchRuleOverrides?.[rule.id] ?? null,
      applied: isLaunchRuleApplied(rule, overrides),
    }));

  let launchOptions = await getLinuxLaunchEnvironment(
    objectId,
    gameKey,
    game,
    executablePath,
    userPreferences,
    prepareMissing
  );

  let protonChoice: string | null = null;
  let mangohud = false;
  let gamemode = false;
  let gamescope: GamescopeSettings | null = null;

  for (const match of matchedRules) {
    if (!match.applied) continue;
    const rule = rules.find((item) => item.id === match.ruleId)!;
    launchOptions = applyDefaultLaunchOptions(
      launchOptions,
      rule.launchOptions
    );

    const actions = rule.actions;
    if (!actions) continue;
    if (actions.proton) protonChoice = actions.proton;
    mangohud ||= actions.mangohud === true;
    gamemode ||= actions.gamemode === true;
    if (actions.gamescope) gamescope = actions.gamescope;
  }

  const offloadGpu = getMachineProfile().offloadGpu;
  if (
    offloadGpu &&
    (offloadGpu.vendor === "nvidia" || offloadGpu.vendor === "amd") &&
    getCapabilityOverride(game, "discrete_gpu") === true
  )
    launchOptions = applyDefaultLaunchOptions(
      launchOptions,
      offloadLaunchOptions(offloadGpu.vendor)
    );

  if (gamescope && !isGamescopeSession()) {
    launchOptions = applyDefaultLaunchOptions(
      launchOptions,
      buildGamescopeLaunchOptions(await withDisplayDefaults(gamescope))
    );
  }

  return {
    rules: matchedRules,
    launchOptions,
    protonPath: await resolveProtonChoice(protonChoice),
    mangohud,
    gamemode,
    gamescope,
  };
};

/**
 * The launch options a game runs with: Hydra's additions, then the default
 * launch options (unless the game opted out), then the game's own.
 */
export const combineLaunchOptions = (
  additions: string | null,
  userPreferences: UserPreferences | null,
  game: Game | undefined,
  gameLaunchOptions: string | null | undefined
) =>
  applyDefaultLaunchOptions(
    additions,
    applyDefaultLaunchOptions(
      userPreferences?.defaultLaunchOptions,
      gameLaunchOptions,
      game?.ignoreDefaultLaunchOptions === true
    )
  );

/** Whether MangoHud and GameMode wrap the game: the game's choice, else globally or by a rule. */
export const getLaunchTools = (
  userPreferences: UserPreferences | null,
  game: Game | undefined,
  additions?: Pick<GameLaunchAdditions, "mangohud" | "gamemode">
) => ({
  useMangohud:
    isLaunchWrapperWanted(
      "mangohud",
      game,
      userPreferences,
      additions?.mangohud === true
    ) && isMangohudAvailable(),
  useGamemode:
    isLaunchWrapperWanted(
      "gamemode",
      game,
      userPreferences,
      additions?.gamemode === true
    ) && isGamemodeAvailable(),
});

/** Adds `MANGOHUD_CONFIGFILE` under everything else, so launch options can override it. */
export const withMangoHudConfig = (
  launchOptions: string | null,
  configPath: string | null
) =>
  configPath
    ? applyDefaultLaunchOptions(
        // Whole-token quotes, as string-argv keeps quotes inside a token.
        `"MANGOHUD_CONFIGFILE=${configPath}" %command%`,
        launchOptions
      )
    : launchOptions;

/**
 * The launch options and tools a launch of the game uses: its additions and
 * MangoHud layout, then the default and per-game launch options.
 */
export const resolveGameLaunchOptions = async ({
  objectId,
  gameKey,
  game,
  executablePath,
  userPreferences,
  gameLaunchOptions,
  prepareMissing = true,
  writeMangoHudConfig = true,
}: {
  objectId: string;
  gameKey: string;
  game: Game | undefined;
  executablePath: string;
  userPreferences: UserPreferences | null;
  gameLaunchOptions: string | null | undefined;
  prepareMissing?: boolean;
  writeMangoHudConfig?: boolean;
}) => {
  const additions = await getLaunchAdditions({
    objectId,
    gameKey,
    game,
    executablePath,
    userPreferences,
    prepareMissing,
  });
  const tools = getLaunchTools(userPreferences, game, additions);
  const { useGamemode } = tools;
  let { useMangohud } = tools;
  let mangoHudConfigPath =
    useMangohud && game
      ? await prepareMangoHudConfig(game, userPreferences, {
          write: writeMangoHudConfig,
        })
      : null;
  // In-game notices run MangoHud with nothing on screen but the notices.
  if (
    !useMangohud &&
    game &&
    process.platform === "linux" &&
    resolveInGameNotices(userPreferences?.inGameNotices, isMangohudAvailable())
  ) {
    mangoHudConfigPath = await InGameNotices.prepareNoticesOnlyConfig(game, {
      write: writeMangoHudConfig,
    });
    useMangohud = mangoHudConfigPath !== null;
  }
  if (mangoHudConfigPath && writeMangoHudConfig) {
    await InGameNotices.register(gameKey, mangoHudConfigPath);
  }

  return {
    additions,
    useMangohud,
    useGamemode,
    launchOptions: combineLaunchOptions(
      withMangoHudConfig(additions.launchOptions, mangoHudConfigPath),
      userPreferences,
      game,
      gameLaunchOptions
    ),
  };
};
