/**
 * The palette contract between matugen and the renderer.
 *
 * matugen renders MATUGEN_TEMPLATE into a CSS file of `--hydra-*` custom
 * properties; the main process parses it and the renderer sets those on
 * `:root`. globals.scss reads each one as `var(--hydra-x, <built-in colour>)`,
 * so an absent or partial palette leaves the stock look untouched.
 */

/** Token name (without the `--hydra-` prefix) -> the Material role it takes. */
export const MATUGEN_PALETTE_ROLES = {
  background: "surface",
  "background-deep": "surface_container_lowest",
  surface: "surface_container",
  "text-strong": "on_surface",
  text: "on_surface_variant",
  accent: "primary",
  "accent-secondary": "tertiary",
} as const;

export type MatugenPaletteToken = keyof typeof MATUGEN_PALETTE_ROLES | "border";

export const MATUGEN_PALETTE_TOKENS: MatugenPaletteToken[] = [
  ...(Object.keys(MATUGEN_PALETTE_ROLES) as MatugenPaletteToken[]),
  "border",
];

export const MATUGEN_PALETTE_PREFIX = "--hydra-";

export type MatugenPalette = Partial<Record<MatugenPaletteToken, string>>;

/** Hydra is dark-only, so the template always reads matugen's dark scheme. */
export const MATUGEN_TEMPLATE = `/* Hydra Plus palette, rendered by matugen. Edit the template, never this file.
 * Hydra Plus is dark-only, so this reads matugen's dark scheme. Only the
 * \`--hydra-*\` properties below are read; anything else in this file is ignored. */
:root {
${Object.entries(MATUGEN_PALETTE_ROLES)
  .map(
    ([token, role]) =>
      `  ${MATUGEN_PALETTE_PREFIX}${token}: {{colors.${role}.dark.hex}};`
  )
  .join("\n")}
  ${MATUGEN_PALETTE_PREFIX}border: color-mix(in srgb, {{colors.on_surface.dark.hex}} 8%, transparent);
}
`;

const TEMPLATE_COLOR = /\{\{colors\.([a-z_]+)\.dark\.hex\}\}/g;

/**
 * Fills the template from already-known dark-scheme colours (role -> #hex),
 * as matugen would. Null when a role is missing, so a partial palette is never
 * written.
 */
export const renderMatugenTemplate = (
  template: string,
  darkColors: Record<string, unknown> | null | undefined
): string | null => {
  if (!darkColors) return null;

  let complete = true;
  const rendered = template.replace(TEMPLATE_COLOR, (_match, role: string) => {
    const value = darkColors[role];
    if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value))
      return value;
    complete = false;
    return "";
  });

  return complete ? rendered : null;
};

const MAX_VALUE_LENGTH = 200;
const FORBIDDEN_VALUE = /[;{}<>\\]|url\(|var\(|\/\*/i;

const isTokenValue = (value: string) =>
  value.length > 0 &&
  value.length <= MAX_VALUE_LENGTH &&
  !FORBIDDEN_VALUE.test(value);

/** Reads the known `--hydra-*` declarations out of a matugen-rendered CSS file. */
export const parseMatugenPalette = (css: string): MatugenPalette => {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const palette: MatugenPalette = {};

  for (const token of MATUGEN_PALETTE_TOKENS) {
    const pattern = new RegExp(
      `${MATUGEN_PALETTE_PREFIX}${token}\\s*:\\s*([^;}]+)`,
      "g"
    );

    let value: string | undefined;
    for (const match of withoutComments.matchAll(pattern)) {
      value = match[1].trim();
    }

    if (value && isTokenValue(value)) palette[token] = value;
  }

  return palette;
};

/** Escapes a path for a TOML basic string (matugen's config format). */
const tomlString = (value: string) => JSON.stringify(value);

export const buildMatugenConfigBlock = (
  templatePath: string,
  outputPath: string
) =>
  `[templates.hydraplus]\ninput_path = ${tomlString(templatePath)}\noutput_path = ${tomlString(outputPath)}\n`;

export const MATUGEN_CONFIG_TABLE = /^\s*\[templates\.hydraplus\]\s*$/m;

/** Adds the Hydra Plus template to a matugen config, or leaves it alone if present. */
export const addTemplateToMatugenConfig = (
  existing: string | null,
  templatePath: string,
  outputPath: string
): { config: string; changed: boolean } => {
  if (existing !== null && MATUGEN_CONFIG_TABLE.test(existing)) {
    return { config: existing, changed: false };
  }

  const block = buildMatugenConfigBlock(templatePath, outputPath);
  const base =
    existing === null || existing.trim() === "" ? "[config]\n" : existing;
  const separator = base.endsWith("\n") ? "\n" : "\n\n";

  return { config: `${base}${separator}${block}`, changed: true };
};
