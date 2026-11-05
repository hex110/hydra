import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addTemplateToMatugenConfig,
  MATUGEN_TEMPLATE,
  parseMatugenPalette,
} from "./matugen-palette.js";

describe("parseMatugenPalette", () => {
  it("reads every token from a rendered template", () => {
    const rendered = MATUGEN_TEMPLATE.replace(
      /\{\{colors\.[a-z_]+\.dark\.hex\}\}/g,
      "#112233"
    );

    assert.deepEqual(parseMatugenPalette(rendered), {
      background: "#112233",
      "background-deep": "#112233",
      surface: "#112233",
      "text-strong": "#112233",
      text: "#112233",
      accent: "#112233",
      "accent-secondary": "#112233",
      border: "color-mix(in srgb, #112233 8%, transparent)",
    });
  });

  it("ignores unknown properties, comments and other rules", () => {
    const palette = parseMatugenPalette(`
      /* --hydra-accent: #ff0000; */
      body { background: red; }
      :root { --other: #000; --hydra-accent: #abcdef; --hydra-nope: #123456 }
    `);

    assert.deepEqual(palette, { accent: "#abcdef" });
  });

  it("takes the last declaration of a token", () => {
    const palette = parseMatugenPalette(
      ":root { --hydra-accent: #111111; --hydra-accent: #222222; }"
    );

    assert.equal(palette.accent, "#222222");
  });

  it("drops values that could escape a colour position", () => {
    const palette = parseMatugenPalette(`:root {
      --hydra-accent: url(https://example.com/x.png);
      --hydra-text: var(--hydra-accent);
      --hydra-background: #101010;
    }`);

    assert.deepEqual(palette, { background: "#101010" });
  });

  it("returns an empty palette for an empty or unrelated file", () => {
    assert.deepEqual(parseMatugenPalette(""), {});
    assert.deepEqual(parseMatugenPalette("a { color: red }"), {});
  });
});

describe("addTemplateToMatugenConfig", () => {
  const template = "/home/u/.config/hydra-plus/matugen/template.css";
  const output = "/home/u/.config/hydra-plus/matugen/palette.css";

  it("creates a config when there is none", () => {
    const { config, changed } = addTemplateToMatugenConfig(
      null,
      template,
      output
    );

    assert.equal(changed, true);
    assert.match(config, /^\[config\]\n\n\[templates\.hydraplus\]\n/);
    assert.match(config, new RegExp(`input_path = "${template}"`));
    assert.match(config, new RegExp(`output_path = "${output}"`));
  });

  it("appends to an existing config and keeps it intact", () => {
    const existing = '[config]\n\n[templates.btop]\ninput_path = "a"\n';
    const { config, changed } = addTemplateToMatugenConfig(
      existing,
      template,
      output
    );

    assert.equal(changed, true);
    assert.ok(config.startsWith(existing));
    assert.match(config, /\[templates\.hydraplus\]/);
  });

  it("separates the block when the file has no trailing newline", () => {
    const { config } = addTemplateToMatugenConfig("[config]", template, output);

    assert.match(config, /^\[config\]\n\n\[templates\.hydraplus\]/);
  });

  it("does nothing when the template is already configured", () => {
    const existing = `[config]\n\n[templates.hydraplus]\ninput_path = "x"\noutput_path = "y"\n`;
    const result = addTemplateToMatugenConfig(existing, template, output);

    assert.equal(result.changed, false);
    assert.equal(result.config, existing);
  });

  it("escapes backslashes in Windows paths", () => {
    const { config } = addTemplateToMatugenConfig(
      null,
      "C:\\Users\\u\\t.css",
      "C:\\Users\\u\\p.css"
    );

    assert.match(config, /input_path = "C:\\\\Users\\\\u\\\\t\.css"/);
  });
});
