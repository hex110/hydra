import path from "node:path";
import stringArgv from "string-argv";

/**
 * Wrappers that manage OptiScaler in the game folder on every launch.
 * GOverlay's `bgmod` (`fgmod` is its old name) deletes OptiScaler files it
 * did not install and exports its own `MANGOHUD_CONFIGFILE`.
 */
const FILE_MANAGING_WRAPPERS = new Set(["bgmod", "fgmod"]);

/** File-managing wrappers named in launch options, by file name. */
export const findConflictingWrappers = (
  launchOptions: string | null | undefined
): string[] => {
  if (!launchOptions) return [];

  const found = stringArgv(launchOptions)
    .map((token) => path.basename(token.replace(/^["']|["']$/g, "")))
    .filter((name) => FILE_MANAGING_WRAPPERS.has(name.toLowerCase()));

  return [...new Set(found)];
};
