import fs from "node:fs";
import path from "node:path";
import {
  applyIniOverrides,
  type IniOverride,
} from "../../../shared/ini-overrides.js";
import { RESHADE_INI_FILE } from "../../../shared/reshade.js";

export type ReShadeIniResult = "missing" | "unchanged" | "updated";

/**
 * Applies the overrides to the game's ReShade.ini, matching the file name
 * without regard to case since installs differ. A game without one is left
 * alone: ReShade writes its own on first run, and Hydra does not install it.
 */
export const applyReShadeIniOverrides = async (
  directory: string,
  overrides: IniOverride[]
): Promise<ReShadeIniResult> => {
  const fileName = (await fs.promises.readdir(directory)).find(
    (name) => name.toLowerCase() === RESHADE_INI_FILE.toLowerCase()
  );
  if (!fileName) return "missing";

  const iniPath = path.join(directory, fileName);
  const ini = await fs.promises.readFile(iniPath, "utf8");
  const updated = applyIniOverrides(ini, overrides);
  if (updated === ini) return "unchanged";

  await fs.promises.writeFile(iniPath, updated);
  return "updated";
};
