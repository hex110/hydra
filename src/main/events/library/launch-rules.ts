import { db, gamesSublevel, levelKeys } from "@main/level";
import { parseExecutablePath } from "@main/events/helpers/parse-executable-path";
import { getLaunchAdditions } from "@main/helpers/launch-additions";
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

const setGameLaunchRuleIgnored = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  ruleId: string,
  ignored: boolean
) => {
  await updateGameRecord(levelKeys.game(shop, objectId), (game) => {
    const current = new Set(game.ignoredLaunchRules ?? []);
    if (ignored) current.add(ruleId);
    else current.delete(ruleId);
    return { ignoredLaunchRules: [...current] };
  });
};

registerEvent("getGameLaunchAdditions", getGameLaunchAdditions);
registerEvent("setGameLaunchRuleIgnored", setGameLaunchRuleIgnored);
