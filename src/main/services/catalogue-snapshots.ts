import { catalogueSnapshotsSublevel } from "@main/level";
import { logger } from "./logger";

const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 40;
const MAX_KEY_LENGTH = 200;

export interface CatalogueSnapshot<T = unknown> {
  at: number;
  data: T;
}

const isKey = (key: unknown): key is string =>
  typeof key === "string" && key.length > 0 && key.length <= MAX_KEY_LENGTH;

/** What a catalogue surface showed last, so it can show it again at once; null when there is none. */
export const getCatalogueSnapshot = async <T = unknown>(
  key: string
): Promise<CatalogueSnapshot<T> | null> => {
  if (!isKey(key)) return null;
  const entry = await catalogueSnapshotsSublevel
    .get(key)
    .catch(() => undefined);
  if (!entry || Date.now() - entry.at > KEEP_MS) return null;
  return entry as CatalogueSnapshot<T>;
};

/** Drops the oldest entries past the limit and those older than 30 days. */
const prune = async () => {
  const entries = await catalogueSnapshotsSublevel.iterator().all();
  const now = Date.now();
  const sorted = entries.sort((a, b) => b[1].at - a[1].at);
  const stale = sorted.filter(
    ([, value], index) => index >= MAX_ENTRIES || now - value.at > KEEP_MS
  );
  if (stale.length === 0) return;

  const batch = catalogueSnapshotsSublevel.batch();
  stale.forEach(([key]) => batch.del(key));
  await batch.write();
};

export const setCatalogueSnapshot = async (key: string, data: unknown) => {
  if (!isKey(key)) return;
  try {
    await catalogueSnapshotsSublevel.put(key, { at: Date.now(), data });
    await prune();
  } catch (error) {
    logger.warn(`[CatalogueSnapshots] Could not store ${key}`, error);
  }
};
