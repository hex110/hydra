import {
  AnkerGamesCatalogue,
  AnkerGamesHomeFeed,
  getBrowserDownloadsDirectory,
} from "@main/services/ankergames";
import { registerEvent } from "../register-event";

const getAnkerGamesStatus = () => AnkerGamesCatalogue.getStatus();

const refreshAnkerGames = () => AnkerGamesCatalogue.refresh(true);

const getAnkerGamesBrowserDownloadsPath = () => getBrowserDownloadsDirectory();

const getAnkerGamesFeed = () => AnkerGamesHomeFeed.get();

registerEvent("getAnkerGamesStatus", getAnkerGamesStatus);
registerEvent("getAnkerGamesFeed", getAnkerGamesFeed);
registerEvent("refreshAnkerGames", refreshAnkerGames);
registerEvent(
  "getAnkerGamesBrowserDownloadsPath",
  getAnkerGamesBrowserDownloadsPath
);
