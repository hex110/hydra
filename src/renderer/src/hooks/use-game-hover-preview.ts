import { useEffect, useState } from "react";
import type { GameShop } from "@types";
import { useHoverPreview } from "@renderer/hooks/use-hover-preview";
import {
  getKnownCatalogueFacts,
  loadCatalogueRowDetails,
} from "@renderer/pages/catalogue/use-catalogue-row-details";
import { logger } from "@renderer/logger";

/**
 * {@link useHoverPreview} for a game whose details aren't loaded in bulk, as
 * in the library: they are fetched once the pointer has rested on it. Only
 * Steam games have screenshots and a description; the rest never open one.
 */
export function useGameHoverPreview(
  game: Readonly<{ shop: GameShop; objectId: string; title: string }>
) {
  const { shop, objectId, title } = game;
  const [facts, setFacts] = useState(() =>
    getKnownCatalogueFacts({ shop, objectId })
  );
  const preview = useHoverPreview(facts?.screenshots ?? []);
  const { cardOpen } = preview;

  useEffect(() => {
    setFacts(getKnownCatalogueFacts({ shop, objectId }));
  }, [shop, objectId]);

  useEffect(() => {
    if (!cardOpen || facts || shop !== "steam") return;
    let current = true;

    loadCatalogueRowDetails([{ shop, objectId, title }])
      .then(() => {
        if (current) setFacts(getKnownCatalogueFacts({ shop, objectId }));
      })
      .catch((error) => logger.error("Failed to load hover details", error));

    return () => {
      current = false;
    };
  }, [cardOpen, facts, shop, objectId, title]);

  return { ...preview, facts };
}
