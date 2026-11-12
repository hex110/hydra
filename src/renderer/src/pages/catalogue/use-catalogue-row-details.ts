import { useEffect, useState } from "react";
import type { StoreGameFacts } from "@shared";
import type { GameShop } from "@types";
import { logger } from "@renderer/logger";

const CHUNK_SIZE = 10;

interface RowGame {
  shop: GameShop;
  objectId: string;
  title: string;
  releaseYear?: number | null;
}

const known = new Map<string, StoreGameFacts>();

export const getKnownCatalogueFacts = (
  game: Pick<RowGame, "shop" | "objectId">
) => known.get(`${game.shop}:${game.objectId}`);

/** Fetches details into the shared cache, which every card reads from. */
export const loadCatalogueRowDetails = async (games: RowGame[]) => {
  const result = await window.electron.getCatalogueRowDetails(
    games.map(({ shop, objectId, title, releaseYear }) => ({
      shop,
      objectId,
      title,
      releaseYear,
    }))
  );
  for (const [key, value] of Object.entries(result)) known.set(key, value);
};

/** Reviews, score, How Long to Beat, size and screenshots for the games on screen. */
export function useCatalogueRowDetails(games: RowGame[]) {
  const [details, setDetails] = useState(() => new Map(known));
  const keys = games.map((game) => `${game.shop}:${game.objectId}`).join("|");

  useEffect(() => {
    const missing = games.filter(
      (game) =>
        game.shop !== "custom" && !known.has(`${game.shop}:${game.objectId}`)
    );
    if (missing.length === 0) return;

    let current = true;

    // Chunks, so the first rows fill in before the last ones are fetched.
    const load = async () => {
      for (let index = 0; index < missing.length; index += CHUNK_SIZE) {
        const chunk = missing.slice(index, index + CHUNK_SIZE);
        await loadCatalogueRowDetails(chunk);
        if (!current) return;
        setDetails(new Map(known));
      }
    };

    load().catch((error) =>
      logger.error("Failed to load catalogue row details", error)
    );

    return () => {
      current = false;
    };
    // The games are identified by `keys`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  return details;
}
