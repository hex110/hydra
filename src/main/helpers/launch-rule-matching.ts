import fs from "node:fs";
import path from "node:path";
import type { LaunchRule } from "@types";
import { matchesLaunchRulePattern } from "../../shared/launch-rules.js";

const MAX_DEPTH = 6;
const MAX_ENTRIES = 20_000;

/**
 * Walks a game folder breadth-first and returns, per file-based rule, the
 * first file or folder (relative to the game folder) matching one of its
 * patterns. Disabled rules are matched too, since a game can turn them on.
 */
export const findLaunchRuleMatches = async (
  gameRoot: string,
  rules: LaunchRule[]
): Promise<Map<string, string>> => {
  const matches = new Map<string, string>();
  const pending = rules.filter(
    (rule) => !rule.matchAllGames && rule.files.some((file) => file.trim())
  );
  if (pending.length === 0) return matches;

  let visited = 0;
  let level = [gameRoot];

  for (let depth = 0; depth <= MAX_DEPTH && level.length > 0; depth++) {
    const next: string[] = [];

    for (const directory of level) {
      const entries = await fs.promises
        .readdir(directory, { withFileTypes: true })
        .catch(() => [] as fs.Dirent[]);

      for (const entry of entries) {
        if (++visited > MAX_ENTRIES) return matches;
        const entryPath = path.join(directory, entry.name);

        for (const rule of pending) {
          if (matches.has(rule.id)) continue;
          if (
            rule.files.some((pattern) =>
              matchesLaunchRulePattern(entry.name, pattern)
            )
          ) {
            matches.set(rule.id, path.relative(gameRoot, entryPath));
          }
        }

        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          next.push(entryPath);
        }
      }

      if (matches.size === pending.length) return matches;
    }

    level = next;
  }

  return matches;
};
