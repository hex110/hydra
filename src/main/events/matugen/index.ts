import {
  getMatugenPalette,
  setMatugenPalette,
  setupMatugenPalette,
} from "@main/services/matugen-palette";
import { registerEvent } from "../register-event";

registerEvent("getMatugenPalette", () => getMatugenPalette());

registerEvent(
  "setMatugenPalette",
  (
    _event: Electron.IpcMainInvokeEvent,
    update: { enabled?: boolean; path?: string | null }
  ) => setMatugenPalette(update)
);

registerEvent("setupMatugenPalette", () => setupMatugenPalette());
