import { LocalSources } from "@main/services/local-sources/local-sources";
import { registerEvent } from "../register-event";

const getLocalSourceRepacks = (
  _event: Electron.IpcMainInvokeEvent,
  title: string
) => LocalSources.findRepacks(title);

const getLocalSourceStatuses = () => LocalSources.getStatuses();

const refreshLocalSources = () => LocalSources.refreshAll(true);

registerEvent("getLocalSourceRepacks", getLocalSourceRepacks);
registerEvent("getLocalSourceStatuses", getLocalSourceStatuses);
registerEvent("refreshLocalSources", refreshLocalSources);
