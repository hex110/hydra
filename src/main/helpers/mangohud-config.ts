import fs from "node:fs";
import path from "node:path";
import { SystemPath } from "@main/services/system-path";
import { logger } from "@main/services/logger";
import { buildMangoHudConfig } from "@shared";
import type { Game, MangoHudSettings, UserPreferences } from "@types";

/**
 * Prints the upscaler and frame generation OptiScaler reports in its log,
 * e.g. "FSR 4 · FG XeFG". MangoHud runs it through `exec=` and shows the
 * output next to "Upscaler".
 */
const OPTISCALER_STATUS_SCRIPT = `#!/bin/sh
log="$1"
[ -f "$log" ] || { echo "OptiScaler log missing"; exit 0; }
tail -n 4000 "$log" | tr -d '\\r' | awk '
  /init successful for/ { match($0, /for [a-z0-9_]+/); up = substr($0, RSTART + 4, RLENGTH - 4) }
  /InitFSR4Update .*loaded/ { fsr4 = 1 }
  /FrameGen.Enabled:/ { fg = $NF }
  /FrameGen.FGOutput:/ { out = $NF }
  /Can.t init FG Feature/ { fgfail = 1 }
  END {
    names["fsr31"] = "FSR 3.1"; names["fsr22"] = "FSR 2.2"; names["fsr21"] = "FSR 2.1";
    names["xess"] = "XeSS"; names["dlss"] = "DLSS"; names["fsr31_12"] = "FSR 3.1";
    name = (up in names) ? names[up] : (up == "" ? "native" : up);
    if (fsr4 && name == "FSR 3.1") name = "FSR 4";
    if (fg != "true") f = "FG off";
    else if (fgfail) f = "FG failed";
    else f = "FG " (out == "" ? "on" : out);
    print name " · " f
  }'
`;

const getMangoHudDirectory = () =>
  path.join(SystemPath.getPath("userData"), "mangohud");

/** The layout a game uses: its own, else the default from settings, else none. */
export const getMangoHudSettings = (
  game: Pick<Game, "mangoHud"> | undefined,
  userPreferences: UserPreferences | null
): MangoHudSettings | null =>
  game?.mangoHud ?? userPreferences?.mangoHud ?? null;

/**
 * Writes the game's MangoHud config and returns its path for
 * `MANGOHUD_CONFIGFILE`, or null when no layout is set (MangoHud then reads
 * its own config). With `write` false only the path is computed.
 */
export const prepareMangoHudConfig = async (
  game: Game,
  userPreferences: UserPreferences | null,
  { write = true }: { write?: boolean } = {}
): Promise<string | null> => {
  const settings = getMangoHudSettings(game, userPreferences);
  if (!settings) return null;

  const directory = getMangoHudDirectory();
  const configPath = path.join(
    directory,
    `${game.shop}-${game.objectId.replaceAll(/[^\w.-]/g, "_")}.conf`
  );
  if (!write) return configPath;

  try {
    await fs.promises.mkdir(directory, { recursive: true });

    let upscalerCommand: string | null = null;
    if (settings.showUpscaler && game.optiScaler?.directory) {
      const scriptPath = path.join(directory, "optiscaler-status.sh");
      await fs.promises.writeFile(scriptPath, OPTISCALER_STATUS_SCRIPT, {
        mode: 0o755,
      });
      upscalerCommand = `sh '${scriptPath}' '${path.join(game.optiScaler.directory, "OptiScaler.log")}'`;
    }

    await fs.promises.writeFile(
      configPath,
      buildMangoHudConfig(settings, upscalerCommand)
    );
    return configPath;
  } catch (error) {
    logger.warn("[MangoHud] Could not write the config", { error });
    return null;
  }
};
