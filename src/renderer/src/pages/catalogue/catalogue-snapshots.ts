import { logger } from "@renderer/logger";

/** A short, stable name for a long key (e.g. a set of options). */
export const hashKey = (value: string) => {
  let hash = 5381;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
};

/** What a catalogue surface showed last time; null when there is none or it can't be read. */
export const readCatalogueSnapshot = async <T>(
  key: string
): Promise<{ at: number; data: T } | null> => {
  try {
    return (await window.electron.getCatalogueSnapshot(key)) as {
      at: number;
      data: T;
    } | null;
  } catch (error) {
    logger.warn(`Could not read the catalogue snapshot ${key}`, error);
    return null;
  }
};

export const writeCatalogueSnapshot = (key: string, data: unknown) => {
  window.electron.setCatalogueSnapshot(key, data).catch((error) => {
    logger.warn(`Could not store the catalogue snapshot ${key}`, error);
  });
};
