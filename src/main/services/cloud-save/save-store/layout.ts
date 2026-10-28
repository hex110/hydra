import type { GameShop } from "@types";

/** Where things live under the chosen folder or remote. */
export const ROOT = "hydra-plus-saves/v1";

const encode = (value: string) => Buffer.from(value).toString("base64url");

/**
 * Snapshot ids carry the game, so a restore needs no extra lookup. Only
 * letters, digits and dashes: restore uses the id as a folder name.
 */
export const snapshotIdFor = (shop: GameShop, objectId: string) =>
  `hp1-${shop}-${Buffer.from(objectId).toString("hex")}`;

export const parseSnapshotId = (snapshotId: string) => {
  const [prefix, shop, objectId] = snapshotId.split("-");
  if (prefix !== "hp1" || !shop || !objectId) {
    throw new Error(`Unknown self-hosted snapshot id ${snapshotId}`);
  }
  return {
    shop: shop as GameShop,
    objectId: Buffer.from(objectId, "hex").toString(),
  };
};

export const gameDir = (shop: GameShop, objectId: string) =>
  `${ROOT}/games/${shop}/${encode(objectId)}`;

export const blobPath = (hash: string, sizeBytes: number) =>
  `${ROOT}/blobs/${hash.slice(0, 2)}/${hash}-${sizeBytes}`;

export const devicePath = (deviceId: string) =>
  `${ROOT}/devices/${deviceId}.json`;

/** The games in one device's library, kept apart from its (smaller, merged) state. */
export const libraryPath = (deviceId: string) =>
  `${ROOT}/libraries/${deviceId}.json`;

/**
 * A version is one file per device that wrote it (`3.<device>.json`), so two
 * devices never write the same key and a race shows up as two files for one
 * version. Older stores wrote `3.json`.
 */
export const versionFileName = (version: number, deviceId: string) =>
  `${version}.${deviceId}.json`;

export const parseVersionFileName = (name: string) => {
  const match = /^(\d+)(?:\.([A-Za-z0-9_-]+))?\.json$/.exec(name);
  return match ? { version: Number(match[1]), deviceId: match[2] ?? "" } : null;
};

/** Which file every device reads when a crash left several for one version. */
export const pickVersionFile = (names: string[]) => [...names].sort()[0];
