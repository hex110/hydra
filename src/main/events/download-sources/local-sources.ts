import { LocalSources } from "@main/services/local-sources/local-sources";
import { registerEvent } from "../register-event";

const getLocalSourceRepacks = (
  _event: Electron.IpcMainInvokeEvent,
  title: string
) => LocalSources.findRepacks(title);

/** Which of these titles AnkerGames or a local source can download, in order. */
const hasLocalSourceRepacks = (
  _event: Electron.IpcMainInvokeEvent,
  titles: string[]
) =>
  Promise.all(
    titles.map((title) => LocalSources.hasRepacks(title).catch(() => false))
  );

const getLocalSourceStatuses = () => LocalSources.getStatuses();

const refreshLocalSources = () => LocalSources.refreshAll(true);

const verifyLocalSource = (
  _event: Electron.IpcMainInvokeEvent,
  sourceId: string
) => LocalSources.verify(sourceId);

registerEvent("getLocalSourceRepacks", getLocalSourceRepacks);
registerEvent("hasLocalSourceRepacks", hasLocalSourceRepacks);
registerEvent("getLocalSourceStatuses", getLocalSourceStatuses);
registerEvent("refreshLocalSources", refreshLocalSources);
registerEvent("verifyLocalSource", verifyLocalSource);
