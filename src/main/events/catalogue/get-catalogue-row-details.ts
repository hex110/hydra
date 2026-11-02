import type { GameShop } from "@types";
import { getCatalogueRowDetails } from "@main/services/catalogue-row-details";
import { registerEvent } from "../register-event";

registerEvent(
  "getCatalogueRowDetails",
  (
    _event,
    games: {
      shop: GameShop;
      objectId: string;
      title: string;
      releaseYear?: number | null;
    }[]
  ) => getCatalogueRowDetails(Array.isArray(games) ? games : [])
);
