import fs from "node:fs";
import path from "node:path";

import type {
  GameShop,
  ModPlacementChoice,
  ModPlacementReason,
  ModSource,
} from "@types";

import { logger } from "../logger";
import { SystemPath } from "../system-path";

/**
 * Mods whose description said where their files go but Hydra had to ask:
 * one JSON line each, for a Claude Code session to read and turn into better
 * install rules. Kept on this machine; nothing is sent anywhere.
 */
export const placementExamplesPath = () =>
  path.join(SystemPath.getPath("userData"), "mods", "placement-examples.jsonl");

const MAX_DESCRIPTION = 20_000;
const MAX_FILES = 1_000;

export interface PlacementExample {
  game: {
    title: string;
    shop: GameShop;
    objectId: string;
    nexusDomain: string | null;
    definition: string | null;
  };
  mod: { name: string; version: string | null; source: ModSource };
  reason: ModPlacementReason;
  files: string[];
  guess: ModPlacementChoice[];
  choices: ModPlacementChoice[];
  /** The description as Nexus serves it (BBCode and HTML). */
  description: string | null;
}

export const recordPlacementExample = async (example: PlacementExample) => {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    ...example,
    files: example.files.slice(0, MAX_FILES),
    moreFiles: Math.max(0, example.files.length - MAX_FILES),
    description: example.description?.slice(0, MAX_DESCRIPTION) ?? null,
  });
  try {
    await fs.promises.mkdir(path.dirname(placementExamplesPath()), {
      recursive: true,
    });
    await fs.promises.appendFile(placementExamplesPath(), `${line}\n`);
  } catch (error) {
    logger.warn("[Mods] Could not save the placement example", error);
  }
};

export const countPlacementExamples = async () =>
  fs.promises
    .readFile(placementExamplesPath(), "utf8")
    .then((text) => text.split("\n").filter(Boolean).length)
    .catch(() => 0);
