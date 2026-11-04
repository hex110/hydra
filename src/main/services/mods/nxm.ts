import { Notification, app } from "electron";
import i18next from "i18next";

import { gamesSublevel } from "@main/level";
import { registerLinuxSchemeHandler } from "@main/helpers/linux-scheme-handler";
import { isSameTitle, parseNxmLink } from "@shared";
import type { Game, NexusGameMatch } from "@types";

import { logger } from "../logger";
import { WindowManager } from "../window-manager";
import { ModStore } from "./mod-store";
import { queueNexusModFile } from "./mods";
import {
  findNexusGameByDomain,
  getNexusModFiles,
  getNexusModName,
} from "./nexus";

const NXM_SCHEME = "nxm";

const notify = (body: string) => {
  if (Notification.isSupported()) {
    new Notification({
      title: i18next.t("section_title", { ns: "mods" }),
      body,
    }).show();
  }
};

/** The library game a Nexus game is: its stored match, else by title. */
const findLibraryGame = async (
  nexusGame: NexusGameMatch
): Promise<Game | null> => {
  const games = (await gamesSublevel.values().all()).filter(
    (game) => !game.isDeleted && game.executablePath
  );
  for (const game of games) {
    const mods = await ModStore.getGameMods(game.shop, game.objectId).catch(
      () => null
    );
    if (mods?.nexusGame?.domainName === nexusGame.domainName) return game;
  }
  const byTitle = games.filter((game) =>
    isSameTitle(game.title, nexusGame.name)
  );
  return byTitle.length === 1 ? byTitle[0] : null;
};

/**
 * Installs the file behind Nexus's "Mod Manager Download" button
 * (`nxm://<game>/mods/<mod>/files/<file>`) into the matching library game,
 * through TorBox like the Mods page does.
 */
export const handleNxmLink = async (uri: string) => {
  const link = parseNxmLink(uri);
  if (!link) return;
  const t = i18next.getFixedT(null, "mods");

  try {
    const nexusGame = await findNexusGameByDomain(link.gameDomain);
    const game = nexusGame ? await findLibraryGame(nexusGame) : null;
    if (!nexusGame || !game) {
      notify(t("nxm_no_game", { game: nexusGame?.name ?? link.gameDomain }));
      WindowManager.redirect("library");
      return;
    }

    await ModStore.setNexusGame(game.shop, game.objectId, nexusGame);
    WindowManager.redirect(
      `mods?${new URLSearchParams({
        shop: game.shop,
        objectId: game.objectId,
        title: game.title,
      }).toString()}`
    );

    const [files, modName] = await Promise.all([
      getNexusModFiles(nexusGame.id, link.modId),
      getNexusModName(nexusGame.id, link.modId).catch(() => null),
    ]);
    const file = files.find((candidate) => candidate.fileId === link.fileId);
    const queued = await queueNexusModFile(game.shop, game.objectId, {
      modId: link.modId,
      fileId: link.fileId,
      name: modName ?? file?.name ?? `${link.modId}`,
      version: file?.version ?? null,
    });
    const result = queued.finished ? await queued.finished : queued.result;
    notify(
      result.ok
        ? t("nxm_installed", { mod: modName ?? file?.name, game: game.title })
        : t(`error_${result.error.replaceAll("-", "_")}`)
    );
  } catch (error) {
    logger.error("[Mods] Could not handle an nxm:// link", error);
    notify(t("error_failed"));
  }
};

export const isNxmHandler = () => app.isDefaultProtocolClient(NXM_SCHEME);

/** Makes Hydra open Nexus's "Mod Manager Download" links. */
export const registerNxmHandler = () => {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(NXM_SCHEME, process.execPath, [
        process.argv[1],
      ]);
    }
    return true;
  }
  if (app.setAsDefaultProtocolClient(NXM_SCHEME)) return true;
  if (process.platform === "linux") {
    registerLinuxSchemeHandler(NXM_SCHEME);
    return true;
  }
  return false;
};
