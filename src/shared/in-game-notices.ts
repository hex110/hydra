/**
 * In-game notices: lines Hydra shows inside a running game through MangoHud,
 * which reloads its config file whenever it changes.
 */

/** MangoHud with every stat off: nothing shows until a notice is added. */
export const NOTICES_ONLY_MANGOHUD_CONFIG = [
  "# Written by Hydra Plus: shows Hydra's notices (achievements) in the game.",
  "legacy_layout=false",
  "position=top-center",
  "background_alpha=0",
  "font_size=28",
  "text_outline",
  "",
].join("\n");

/** MangoHud reads one value per line; keep notices on one short line. */
const sanitizeNotice = (text: string) =>
  text
    .replaceAll(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 120);

/** The config with notice lines added at its end, centred above the HUD. */
export const withInGameNotices = (config: string, notices: string[]) => {
  const lines = notices.map(sanitizeNotice).filter(Boolean);
  if (lines.length === 0) return config;
  const base = config.endsWith("\n") ? config : `${config}\n`;
  return `${base}${lines.map((line) => `custom_text_center=${line}`).join("\n")}\n`;
};

/** Whether notices are on: unset follows whether MangoHud is installed. */
export const resolveInGameNotices = (
  preference: boolean | undefined,
  mangohudAvailable: boolean
) => mangohudAvailable && preference !== false;
