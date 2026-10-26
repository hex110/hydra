import { registerEvent } from "../register-event";
import { fetchGameArtwork, logger } from "@main/services";
import { fetchOfficialArtwork } from "@main/services/official-artwork";
import { testSteamGridDbApiKey } from "@main/services/steam-grid-db-direct";
import { UserNotLoggedInError } from "@shared";
import type { ArtworkKind, ArtworkPage, GameShop } from "@types";

/** SteamGridDB, plus the stores' own artwork on the first page. */
const getGameArtwork = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  kind: ArtworkKind,
  page = 0
): Promise<ArtworkPage | null> => {
  if (shop === "custom") return null;

  const [steamGridDb, official] = await Promise.all([
    fetchGameArtwork(shop, objectId, kind, page).catch((error: unknown) => {
      if (error instanceof UserNotLoggedInError) return null;

      logger.error("Failed to fetch game artwork", { shop, objectId, kind });
      return error instanceof Error ? error : new Error(String(error));
    }),
    page === 0 ? fetchOfficialArtwork(shop, objectId, kind) : [],
  ]);

  if (steamGridDb instanceof Error) {
    if (official.length === 0) throw steamGridDb;
    return { items: official, cache: "fresh", hasMore: false };
  }

  if (!steamGridDb) {
    return official.length > 0
      ? { items: official, cache: "fresh", hasMore: false }
      : null;
  }

  return { ...steamGridDb, items: [...official, ...steamGridDb.items] };
};

registerEvent("getGameArtwork", getGameArtwork);

registerEvent("testSteamGridDbApiKey", (_event, apiKey: string) =>
  testSteamGridDbApiKey(apiKey)
);
