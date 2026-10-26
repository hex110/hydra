import { LocalSources } from "@main/services/local-sources/local-sources";
import { registerEvent } from "../register-event";

const getLocalSourceRepacks = (
  _event: Electron.IpcMainInvokeEvent,
  title: string
) => LocalSources.findRepacks(title);

const getLocalSourceStatuses = () => LocalSources.getStatuses();

const refreshLocalSources = () => LocalSources.refreshAll(true);

const verifyLocalSource = (
  _event: Electron.IpcMainInvokeEvent,
  sourceId: string
) => LocalSources.verify(sourceId);

registerEvent("getLocalSourceRepacks", getLocalSourceRepacks);
registerEvent("getLocalSourceStatuses", getLocalSourceStatuses);
registerEvent("refreshLocalSources", refreshLocalSources);
registerEvent("verifyLocalSource", verifyLocalSource);
