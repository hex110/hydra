import { MATUGEN_PALETTE_PREFIX } from "@shared";
import type { MatugenPaletteState } from "@types";

const STYLE_ID = "matugen-palette";

// A <style> element, not inline styles on :root: a custom theme's own rules
// are appended later in <head>, so they still win over the palette.
const apply = ({ palette }: Pick<MatugenPaletteState, "palette">) => {
  let style = document.getElementById(STYLE_ID);

  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.prepend(style);
  }

  const declarations = Object.entries(palette)
    .map(([token, value]) => `${MATUGEN_PALETTE_PREFIX}${token}: ${value};`)
    .join(" ");

  style.textContent = declarations ? `:root { ${declarations} }` : "";
};

/** Applies the matugen palette to this window and keeps it in step. */
export const startMatugenPalette = async () => {
  globalThis.electron.onMatugenPaletteUpdated(apply);

  try {
    apply(await globalThis.electron.getMatugenPalette());
  } catch {
    // No palette is the stock look; nothing to report.
  }
};
