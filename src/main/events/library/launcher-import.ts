import {
  importLauncherGames,
  listLauncherImportCandidates,
} from "@main/services/launcher-import";
import type { LauncherImportPick } from "@types";

import { registerEvent } from "../register-event";

registerEvent("listLauncherImportCandidates", () =>
  listLauncherImportCandidates()
);
registerEvent("importLauncherGames", (_event, picks: LauncherImportPick[]) =>
  importLauncherGames(picks)
);
