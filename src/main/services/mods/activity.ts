import fs from "node:fs";
import path from "node:path";

import type { GameShop, ModActivityEntry } from "@types";

import { logger } from "../logger";
import { SystemPath } from "../system-path";
import { WindowManager } from "../window-manager";

const FILE_NAME = "activity.jsonl";
/** A log past this size keeps its newest lines only. */
const MAX_BYTES = 2 * 1024 * 1024;
const KEPT_LINES = 3_000;
/** An install plan lists this many files; the rest are counted. */
export const MAX_PLAN_FILES = 300;

const activityPath = (shop: GameShop, objectId: string) =>
  path.join(SystemPath.getPath("userData"), "mods", shop, objectId, FILE_NAME);

/** Parameters that must never reach the log: tokens and signed links. */
const SECRET_KEY = /token|secret|password|signature|api_?key|^url$|^link$/i;

const scrub = (details: Record<string, unknown> | undefined) => {
  if (!details) return undefined;
  return Object.fromEntries(
    Object.entries(details).filter(([key]) => !SECRET_KEY.test(key))
  );
};

const queues = new Map<string, Promise<unknown>>();

const trim = async (filePath: string) => {
  const stats = await fs.promises.stat(filePath).catch(() => null);
  if (!stats || stats.size <= MAX_BYTES) return;
  const lines = (await fs.promises.readFile(filePath, "utf8"))
    .split("\n")
    .filter(Boolean);
  await fs.promises.writeFile(
    filePath,
    `${lines.slice(-KEPT_LINES).join("\n")}\n`
  );
};

/**
 * The per-game record of every mod action, one JSON line each, in
 * `<userData>/mods/<shop>/<objectId>/activity.jsonl`: the log a person reads
 * and a report hands to Claude Code. The logger lines stay as they are.
 */
export const ModActivity = {
  append(
    shop: GameShop,
    objectId: string,
    entry: Omit<ModActivityEntry, "at">
  ): Promise<void> {
    const filePath = activityPath(shop, objectId);
    const line: ModActivityEntry = {
      at: new Date().toISOString(),
      ...entry,
      details: scrub(entry.details),
    };
    if (!line.details) delete line.details;

    const previous = queues.get(filePath) ?? Promise.resolve();
    const next = previous
      .then(async () => {
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.appendFile(filePath, `${JSON.stringify(line)}\n`);
        await trim(filePath);
      })
      .catch((error) =>
        logger.warn("[Mods] Could not write the activity log", error)
      )
      .finally(() =>
        WindowManager.sendToAppWindows(
          "on-mod-activity-changed",
          shop,
          objectId
        )
      );
    queues.set(filePath, next);
    return next;
  },

  /** The log, oldest first; `limit` keeps the newest lines. */
  async read(
    shop: GameShop,
    objectId: string,
    limit?: number
  ): Promise<ModActivityEntry[]> {
    await queues.get(activityPath(shop, objectId));
    const text = await fs.promises
      .readFile(activityPath(shop, objectId), "utf8")
      .catch(() => "");
    const entries: ModActivityEntry[] = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line) as ModActivityEntry);
      } catch {
        // A line cut off by a crash is skipped.
      }
    }
    return limit ? entries.slice(-limit) : entries;
  },

  path: activityPath,
};
