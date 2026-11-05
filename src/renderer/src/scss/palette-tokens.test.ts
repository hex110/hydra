import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// These globals.scss tokens are `var(--hydra-*, <colour>)`, so a Sass colour
// function given one does not fail the build; it emits invalid CSS.
const PALETTE_TOKENS = [
  "background-color",
  "dark-background-color",
  "surface-color",
  "muted-color",
  "body-color",
  "border-color",
  "brand-teal",
  "brand-blue",
  "surface-selected-color",
];

const COLOR_FUNCTION = new RegExp(
  String.raw`\b(rgba?|hsla?|darken|lighten|saturate|desaturate|transparentize|opacify|fade-in|fade-out|mix|invert|grayscale|complement|color\.[a-z-]+)\(\s*(?:globals\.)?\$(${PALETTE_TOKENS.join("|")})\b`,
  "g"
);

const scssFiles = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return scssFiles(entryPath);
    return entry.name.endsWith(".scss") ? [entryPath] : [];
  });

describe("palette tokens in the renderer styles", () => {
  it("are never passed to a Sass colour function", () => {
    const offenders = scssFiles(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
    ).flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      return [...source.matchAll(COLOR_FUNCTION)].map(
        (match) => `${path.relative(process.cwd(), file)}: ${match[0]}`
      );
    });

    assert.deepEqual(
      offenders,
      [],
      "use globals.with-alpha() or CSS color-mix() instead"
    );
  });
});
