import { app } from "electron";
import http from "node:http";

import { gamesSublevel, levelKeys } from "@main/level";
import { logger } from "./logger";
import { handleAddonRequest, type AddonGameState } from "./addon-bridge-core";

const DEFAULT_PORT = 41907;

/** A dev build only listens when a port is given, so it never shadows the installed app. */
const getPort = () => {
  const fromEnv = Number(process.env.HYDRA_PLUS_ADDON_PORT);
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv;
  return app.isPackaged ? DEFAULT_PORT : null;
};

const getGameState = async (objectId: string): Promise<AddonGameState> => {
  const game = await gamesSublevel.get(levelKeys.game("steam", objectId));
  if (!game || game.isDeleted) return "none";
  return game.executablePath || game.installedSizeInBytes != null
    ? "installed"
    : "library";
};

export const startAddonBridge = () => {
  const port = getPort();
  if (!port) return;

  const server = http.createServer((req, res) => {
    handleAddonRequest(
      {
        method: req.method,
        url: req.url,
        host: req.headers.host,
        origin: req.headers.origin,
      },
      port,
      getGameState
    )
      .catch((error) => {
        logger.error("Add-on bridge request failed", error);
        return { status: 500, headers: {}, body: "" };
      })
      .then(({ status, headers, body }) => {
        res.writeHead(status, headers);
        res.end(body);
      });
  });

  server.on("error", (error) =>
    logger.warn("Add-on bridge is unavailable", error)
  );
  server.listen(port, "127.0.0.1");
};
