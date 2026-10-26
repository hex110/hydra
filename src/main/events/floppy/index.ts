import { registerEvent } from "../register-event";
import {
  getFloppySyncStatus,
  startFloppyLibrarySync,
  FloppyClient,
} from "@main/services/floppy";

const testFloppyConnection = async (
  _event: Electron.IpcMainInvokeEvent,
  url: string,
  token: string
) => new FloppyClient({ url, token }).testConnection();

const syncFloppyLibrary = async (
  _event: Electron.IpcMainInvokeEvent,
  dryRun: boolean
) => startFloppyLibrarySync(dryRun);

registerEvent("testFloppyConnection", testFloppyConnection);
registerEvent("syncFloppyLibrary", syncFloppyLibrary);

registerEvent("getFloppySyncStatus", () => getFloppySyncStatus());
