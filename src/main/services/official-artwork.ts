import type { ArtworkItem, ArtworkKind, GameShop } from "@types";
import { HydraApi } from "./hydra-api";

interface CatalogueRecordArtwork {
  coverImageUrl?: string | null;
  libraryHeroImageUrl?: string | null;
  logoImageUrl?: string | null;
  iconUrl?: string | null;
  stores?: { shop: GameShop; objectId: string }[];
}

const FIELD_BY_KIND: Record<ArtworkKind, keyof CatalogueRecordArtwork> = {
  grids: "coverImageUrl",
  heroes: "libraryHeroImageUrl",
  logos: "logoImageUrl",
  icons: "iconUrl",
};

/** Stable negative ids, so official art never collides with SteamGridDB ids. */
const artworkIdForUrl = (url: string) => {
  let hash = 0;
  for (let index = 0; index < url.length; index++) {
    hash = (Math.imul(hash, 31) + url.charCodeAt(index)) | 0;
  }
  return -(Math.abs(hash) + 1);
};

const fetchRecord = (shop: GameShop, objectId: string) =>
  HydraApi.get<CatalogueRecordArtwork | null>(
    `/games/${shop}/${encodeURIComponent(objectId)}`,
    null,
    { needsAuth: false }
  ).catch(() => null);

/**
 * The store's own artwork for a game, from every store the catalogue links it
 * to (Steam, Epic, LaunchBox), for the artwork picker next to SteamGridDB.
 */
export const fetchOfficialArtwork = async (
  shop: GameShop,
  objectId: string,
  kind: ArtworkKind
): Promise<ArtworkItem[]> => {
  if (shop === "custom") return [];

  const record = await fetchRecord(shop, objectId);
  if (!record) return [];

  const otherStores = (record.stores ?? []).filter(
    (store) => store.shop !== shop || store.objectId !== objectId
  );
  const records = [
    { shop, record },
    ...(await Promise.all(
      otherStores.map(async (store) => ({
        shop: store.shop,
        record: await fetchRecord(store.shop, store.objectId),
      }))
    )),
  ];

  const seen = new Set<string>();
  return records.flatMap(({ shop: storeShop, record: storeRecord }) => {
    const url = storeRecord?.[FIELD_BY_KIND[kind]];
    if (typeof url !== "string" || !url || seen.has(url)) return [];
    seen.add(url);

    return [
      {
        id: artworkIdForUrl(url),
        score: 0,
        url,
        thumb: url,
        width: 0,
        height: 0,
        provider: storeShop,
      },
    ];
  });
};
