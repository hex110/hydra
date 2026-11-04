// usage: node --import ./scripts/register-ts-node.mjs scripts/dev/mod-hints/score.ts [--misses]
//
// Scores the install-hint reader (src/shared/mod-install-hints.ts) against
// labels.json, using the descriptions build-corpus.mjs cached in
// ~/.cache/hydra-mod-corpus. The game folder is not there, so the folders a
// game "has" are the ones its mods' archives use.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  bestInstallTarget,
  readInstallHints,
} from "../../../src/shared/mod-install-hints.js";
import { nexusDescriptionToText } from "../../../src/shared/mod-placement.js";

interface CorpusEntry {
  game: { domain: string; name: string };
  mod: { modId: number; name: string };
  contents: string[];
  description: string;
}

const root = path.join(os.homedir(), ".cache", "hydra-mod-corpus");
const labels = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, "labels.json"), "utf8")
) as Record<string, Record<string, string | null> | string>;
const showMisses = process.argv.includes("--misses");

const folderPrefixes = (files: string[]) => {
  const folders = new Set<string>();
  for (const file of files) {
    const segments = file.split("/").slice(0, -1);
    for (let depth = 1; depth <= Math.min(segments.length, 4); depth++)
      folders.add(segments.slice(0, depth).join("/"));
  }
  return folders;
};

let right = 0;
let wrong = 0;
let missed = 0;
let falsePositive = 0;
let total = 0;

for (const [domain, mods] of Object.entries(labels)) {
  if (typeof mods === "string" || domain.startsWith("_")) continue;
  const folder = path.join(root, domain);
  if (!fs.existsSync(folder)) {
    console.log(`(no corpus for ${domain}: run build-corpus.mjs ${domain})`);
    continue;
  }
  const entries = fs
    .readdirSync(folder)
    .map(
      (file) =>
        JSON.parse(
          fs.readFileSync(path.join(folder, file), "utf8")
        ) as CorpusEntry
    );
  // Folders that at least two of the game's mods use.
  const counts = new Map<string, number>();
  for (const entry of entries)
    for (const known of folderPrefixes(entry.contents))
      counts.set(known, (counts.get(known) ?? 0) + 1);
  const knownFolders = [
    ...((labels._gameFolders as unknown as Record<string, string[]>)[domain] ??
      []),
    ...[...counts].filter(([, count]) => count >= 2).map(([known]) => known),
  ];

  for (const [modId, expected] of Object.entries(mods)) {
    const entry = entries.find((item) => String(item.mod.modId) === modId);
    if (!entry) continue;
    total++;
    const hints = readInstallHints(nexusDescriptionToText(entry.description), {
      knownFolders,
      gameNames: [
        entry.game.name,
        entry.game.name.replace(/[:™®]/g, ""),
        ...((labels._gameNames as unknown as Record<string, string[]>)[
          domain
        ] ?? []),
      ],
    });
    const got = bestInstallTarget(hints);
    const same =
      got !== null &&
      expected !== null &&
      got.toLowerCase() === expected.toLowerCase();
    let verdict: string;
    if (expected === null && got === null) {
      right++;
      verdict = "ok";
    } else if (same) {
      right++;
      verdict = "ok";
    } else if (expected === null) {
      falsePositive++;
      verdict = "false positive";
    } else if (got === null) {
      missed++;
      verdict = "missed";
    } else {
      wrong++;
      verdict = "wrong";
    }
    if (showMisses && verdict !== "ok") {
      const quote = hints.hints[0]?.quote ?? "";
      console.log(
        `${verdict.padEnd(14)} ${domain} ${modId} ${entry.mod.name.slice(0, 40)}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}${quote ? `\n               from: ${quote.slice(0, 160)}` : ""}`
      );
    }
  }
}

console.log(
  `\n${right}/${total} right (${Math.round((100 * right) / Math.max(total, 1))}%): ${wrong} wrong place, ${missed} missed, ${falsePositive} false positives`
);
