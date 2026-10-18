import { db, gamesSublevel, levelKeys } from "@main/level";
import { parseExecutablePath } from "@main/events/helpers/parse-executable-path";
import { getLaunchAdditions } from "@main/helpers/launch-additions";
import { getLaunchPreview } from "@main/helpers/launch-preview";
import { updateGameRecord } from "@main/services/game-record-updater";
import type { GameLaunchAdditions, GameShop, UserPreferences } from "@types";
import { registerEvent } from "../register-event";

/** What Hydra adds in front of the game's launch options, for its options page. */
const getGameLaunchAdditions = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
): Promise<GameLaunchAdditions> => {
  const gameKey = levelKeys.game(shop, objectId);
  const game = await gamesSublevel.get(gameKey);
  if (!game?.executablePath) return { rules: [], launchOptions: null };

  const userPreferences = await db
    .get<string, UserPreferences | null>(levelKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);

  return getLaunchAdditions({
    objectId,
    gameKey,
    game,
    executablePath: parseExecutablePath(game.executablePath),
    userPreferences,
    prepareMissing: false,
  });
};

/** True or false replaces the rule's setting for the game; null follows it again. */
const setGameLaunchRuleOverride = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  ruleId: string,
  applied: boolean | null
) => {
  await updateGameRecord(levelKeys.game(shop, objectId), (game) => {
    const overrides = { ...game.launchRuleOverrides };
    if (applied === null) delete overrides[ruleId];
    else overrides[ruleId] = applied;
    return { launchRuleOverrides: overrides };
  });
};

registerEvent("getGameLaunchAdditions", getGameLaunchAdditions);
registerEvent("setGameLaunchRuleOverride", setGameLaunchRuleOverride);

const getGameLaunchPreview = (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => getLaunchPreview(shop, objectId);

registerEvent("getGameLaunchPreview", getGameLaunchPreview);
