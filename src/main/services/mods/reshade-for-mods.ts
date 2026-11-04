import type { GameShop } from "@types";

import { logger } from "../logger";
import { RenoDx } from "../renodx/renodx";
import { ModActivity } from "./activity";

/**
 * A mod that is a ReShade add-on needs ReShade's add-on build in the game.
 * Hydra installs it alone (no RenoDX mod) unless the game has anti-cheat or
 * another tool's ReShade; then the Mods page says so and offers Install.
 */
export const ensureReShadeForMods = async (
  shop: GameShop,
  objectId: string,
  modName: string
) => {
  try {
    const status = await RenoDx.getGameStatus(shop, objectId);
    if (status.installation || status.reShade) return;
    if (status.antiCheat || !status.canInstallReShade) {
      await ModActivity.append(shop, objectId, {
        kind: "loader",
        modName,
        message: status.antiCheat
          ? `${modName} needs ReShade with add-on support. Hydra didn't install it on its own because the game has ${status.antiCheat}; install it from the Mods page or Options → Tools if you're sure.`
          : `${modName} needs ReShade with add-on support, and Hydra can't install it here (${status.externallyManaged ? "another tool's ReShade is in the game folder" : (status.conflict?.fileName ?? status.unavailable ?? "no supported graphics API")}).`,
      });
      return;
    }
    const installation = await RenoDx.installReShade(shop, objectId);
    await ModActivity.append(shop, objectId, {
      kind: "loader",
      modName,
      message: `Installed ReShade ${installation.reShadeVersion} (add-on build) into ${installation.directory}, which ${modName} needs; ${installation.proxyDll ? `it loads as ${installation.proxyDll}` : "OptiScaler loads it"}.`,
      details: { reShade: installation },
    });
  } catch (error) {
    logger.warn("[Mods] Could not install ReShade for a mod", error);
    await ModActivity.append(shop, objectId, {
      kind: "error",
      modName,
      message: `Could not install ReShade for ${modName}: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
};
