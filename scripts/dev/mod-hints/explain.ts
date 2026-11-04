// usage: node --import ./scripts/register-ts-node.mjs scripts/dev/mod-hints/explain.ts <gameDomain> <modId>
// Prints every hint and note the reader finds in one cached description.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readInstallHints } from "../../../src/shared/mod-install-hints.js";
import { nexusDescriptionToText } from "../../../src/shared/mod-placement.js";

const [domain, modId] = process.argv.slice(2);
const labels = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, "labels.json"), "utf8")
);
const entry = JSON.parse(
  fs.readFileSync(
    path.join(
      os.homedir(),
      ".cache",
      "hydra-mod-corpus",
      domain,
      `${modId}.json`
    ),
    "utf8"
  )
);
const result = readInstallHints(nexusDescriptionToText(entry.description), {
  knownFolders: labels._gameFolders?.[domain] ?? [],
  gameNames: [entry.game.name, ...(labels._gameNames?.[domain] ?? [])],
});
console.log(JSON.stringify(result, null, 2));
