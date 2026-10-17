import path from "node:path";
import { logger } from "@main/services/logger";
import { Wine } from "@main/services/wine";
import { OptiScaler } from "@main/services/optiscaler/optiscaler";
import { prepareOnlineFixGame } from "@main/services/game-setup/online-fix-step";
import { resolveGameRootForDetection } from "@main/services/optiscaler/game-files";
import { resolveLaunchRules } from "@shared";
import type {
  Game,
  GameLaunchAdditions,
  GameLaunchRuleMatch,
  UserPreferences,
} from "@types";
import { applyDefaultLaunchOptions } from "./default-launch-options";
import { buildLaunchEnvironment } from "./launch-environment";
import { findLaunchRuleMatches } from "./launch-rule-matching";

const isWindowsExecutable = (executablePath: string) =>
  path.extname(executablePath).toLowerCase() === ".exe";

/**
 * Environment Hydra adds when a Windows game runs under Proton: HDR, and the
 * DLL overrides OptiScaler and OnlineFix need to load their proxy DLLs.
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

  const onlineFixEnabled = userPreferences?.prepareOnlineFixGames !== false;
  let onlineFix = game?.onlineFix;
  if (onlineFix === undefined && onlineFixEnabled && prepareMissing) {
    // Games set up before OnlineFix handling existed are checked once here.
    onlineFix = await prepareOnlineFixGame({
      gameKey,
      executablePath,
      winePrefixPath: await Wine.resolvePrefixPath(
        Wine.getEffectivePrefixPath(game?.winePrefixPath, objectId)
      ),
    }).catch((error) => {
      logger.error("Failed to prepare OnlineFix game", { gameKey, error });
      return null;
    });
  }

  const optiScalerDll = OptiScaler.getLaunchNativeDll(game);

  return buildLaunchEnvironment({
    hdr: game?.hdrEnabled ?? userPreferences?.enableHdr === true,
    nativeDlls: [
      ...(optiScalerDll ? [optiScalerDll] : []),
      ...(onlineFixEnabled ? (onlineFix?.proxyDlls ?? []) : []),
    ],
  });
};

/**
 * Everything Hydra adds in front of a game's own launch options: its Linux
 * environment, then each matching launch rule. Later layers win on conflicts.
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
  const ignored = new Set(game?.ignoredLaunchRules ?? []);

  const matches = await findLaunchRuleMatches(
    resolveGameRootForDetection(path.dirname(executablePath)),
    rules
  );

  const matchedRules: GameLaunchRuleMatch[] = rules
    .filter((rule) => matches.has(rule.id))
    .map((rule) => ({
      ruleId: rule.id,
      name: rule.name,
      matchedPath: matches.get(rule.id)!,
      ignored: ignored.has(rule.id),
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
    if (match.ignored) continue;
    const rule = rules.find((item) => item.id === match.ruleId)!;
    launchOptions = applyDefaultLaunchOptions(
      launchOptions,
      rule.launchOptions
    );
  }

  return { rules: matchedRules, launchOptions };
};
