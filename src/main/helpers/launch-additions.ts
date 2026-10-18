import path from "node:path";
import { logger } from "@main/services/logger";
import { Wine } from "@main/services/wine";
import { OptiScaler } from "@main/services/optiscaler/optiscaler";
import { prepareOnlineFixGame } from "@main/services/game-setup/online-fix-step";
import { resolveGameRootForDetection } from "@main/services/optiscaler/game-files";
import { isLaunchRuleApplied, resolveLaunchRules } from "@shared";
import type {
  Game,
  GameLaunchAdditions,
  GameLaunchRuleMatch,
  UserPreferences,
} from "@types";
import { applyDefaultLaunchOptions } from "./default-launch-options";
import { isGamemodeAvailable } from "./is-gamemode-available";
import { isMangohudAvailable } from "./is-mangohud-available";
import { buildLaunchEnvironment } from "./launch-environment";
import { findLaunchRuleMatches } from "./launch-rule-matching";

const isWindowsExecutable = (executablePath: string) =>
  path.extname(executablePath).toLowerCase() === ".exe";

/**
 * Environment Hydra adds when a Windows game runs under Proton: the DLL
 * overrides OptiScaler and OnlineFix need to load their proxy DLLs.
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

  return buildLaunchEnvironment({
    nativeDlls: [
      ...(optiScalerDll ? [optiScalerDll] : []),
      ...(onlineFixEnabled ? (onlineFix?.proxyDlls ?? []) : []),
    ],
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
  const overrides = game?.launchRuleOverrides ?? {};

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
      override: overrides[rule.id] ?? null,
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

  for (const match of matchedRules) {
    if (!match.applied) continue;
    const rule = rules.find((item) => item.id === match.ruleId)!;
    launchOptions = applyDefaultLaunchOptions(
      launchOptions,
      rule.launchOptions
    );
  }

  return { rules: matchedRules, launchOptions };
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

/** Whether MangoHud and GameMode wrap the game, per game or globally. */
export const getLaunchTools = (
  userPreferences: UserPreferences | null,
  game: Game | undefined
) => ({
  useMangohud:
    (userPreferences?.autoRunMangohud === true ||
      game?.autoRunMangohud === true) &&
    isMangohudAvailable(),
  useGamemode:
    (userPreferences?.autoRunGamemode === true ||
      game?.autoRunGamemode === true) &&
    isGamemodeAvailable(),
});
