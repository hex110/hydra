import axios from "axios";
import { app } from "electron";
import http from "node:http";

import { gamesSublevel, levelKeys } from "@main/level";
import { logger } from "./logger";
import {
  handleAddonRequest,
  type AddonGameState,
  type AddonResolvedGame,
} from "./addon-bridge-core";
import { pickSteamTitleMatch, type SteamSearchItem } from "./steam-title-match";

const DEFAULT_PORT = 41907;
const MISS_TTL_MS = 10 * 60 * 1000;
const MAX_CACHED_TITLES = 500;

// A page asks again on every visit; the answer rarely changes.
const resolvedTitles = new Map<
  string,
  { game: AddonResolvedGame | null; expiresAt: number }
>();

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

const searchSteam = async (title: string) => {
  const { data } = await axios.get<{ items?: SteamSearchItem[] }>(
    "https://store.steampowered.com/api/storesearch/",
    { params: { term: title, cc: "us", l: "english" }, timeout: 8000 }
  );
  return data.items ?? [];
};

export const resolveSteamTitle = async (
  title: string
): Promise<AddonResolvedGame | null> => {
  const key = title.toLowerCase();
  const cached = resolvedTitles.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.game;

  try {
    // Steam's search finds nothing for some punctuation, such as " - ".
    const plain = title.replaceAll(/[^\p{L}\p{N}]+/gu, " ").trim();
    let match: SteamSearchItem | null = null;
    for (const term of new Set([title, plain].filter(Boolean))) {
      match = pickSteamTitleMatch(title, await searchSteam(term));
      if (match) break;
    }
    const game = match
      ? { objectId: String(match.id), name: match.name }
      : null;

    if (resolvedTitles.size >= MAX_CACHED_TITLES) resolvedTitles.clear();
    resolvedTitles.set(key, {
      game,
      expiresAt: game ? Infinity : Date.now() + MISS_TTL_MS,
    });
    return game;
  } catch (error) {
    // Steam is unreachable: not a "no match", so it is not cached.
    logger.warn("Add-on bridge could not search Steam", error);
    return null;
  }
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
      { getGameState, resolveTitle: resolveSteamTitle }
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
