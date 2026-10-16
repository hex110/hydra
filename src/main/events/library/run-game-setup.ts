import path from "node:path";
import { gamesSublevel } from "@main/level";
import { parseExecutablePath } from "../helpers/parse-executable-path";
import { registerEvent } from "../register-event";
import { GameSetup } from "@main/services/game-setup";
import { Wine } from "@main/services/wine";
import type { Game, GameShop } from "@types";

const runGameSetup = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => {
  await GameSetup.enqueue(shop, objectId, { reason: "manual", force: true });
};

const isMissingPrefix = async (game: Game) => {
  if (process.platform !== "linux" || !game.executablePath) return false;
  if (game.hasActiveSteamImport || game.epicInstallation) return false;

  const executablePath = parseExecutablePath(game.executablePath);
  if (path.extname(executablePath).toLowerCase() !== ".exe") return false;
  if (/[\\/]steamapps[\\/]common[\\/]/i.test(executablePath)) return false;

  const prefixPath = await Wine.resolvePrefixPath(
    Wine.getEffectivePrefixPath(game.winePrefixPath, game.objectId)
  );
  if (!prefixPath) return false;

  try {
    return !Wine.validatePrefix(prefixPath);
  } catch {
    return true;
  }
};

const listGamesMissingPrefix = async () => {
  const games = await gamesSublevel.values().all();
  const missing: Game[] = [];

  for (const game of games) {
    if (!game.isDeleted && (await isMissingPrefix(game))) missing.push(game);
  }

  return missing;
};

const countGamesMissingPrefix = async () =>
  (await listGamesMissingPrefix()).length;

const prepareMissingGamePrefixes = async () => {
  const missing = await listGamesMissingPrefix();

  for (const game of missing) {
    void GameSetup.enqueue(game.shop, game.objectId, { reason: "manual" });
  }

  return missing.length;
};

registerEvent("runGameSetup", runGameSetup);
registerEvent("countGamesMissingPrefix", countGamesMissingPrefix);
registerEvent("prepareMissingGamePrefixes", prepareMissingGamePrefixes);
