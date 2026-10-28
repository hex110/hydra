import {
  AnkerGamesCatalogue,
  getBrowserDownloadsDirectory,
} from "@main/services/ankergames";
import { registerEvent } from "../register-event";

const getAnkerGamesStatus = () => AnkerGamesCatalogue.getStatus();

const refreshAnkerGames = () => AnkerGamesCatalogue.refresh(true);

const getAnkerGamesBrowserDownloadsPath = () => getBrowserDownloadsDirectory();

registerEvent("getAnkerGamesStatus", getAnkerGamesStatus);
registerEvent("refreshAnkerGames", refreshAnkerGames);
registerEvent(
  "getAnkerGamesBrowserDownloadsPath",
  getAnkerGamesBrowserDownloadsPath
);
