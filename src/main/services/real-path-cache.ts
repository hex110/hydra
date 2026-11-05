import fs from "node:fs";

const REAL_PATH_TTL_MS = 60_000;

const cache = new Map<string, { value: string; at: number }>();

/**
 * The path with symlinks resolved, cached briefly; the path itself when it
 * can't be resolved. Running processes report their resolved path, so a game
 * recorded under a symlink (`~/.steam/steam/...`) never equals its process.
 */
export const getRealPath = async (
  filePath: string,
  now = Date.now()
): Promise<string> => {
  const cached = cache.get(filePath);
  if (cached && now - cached.at < REAL_PATH_TTL_MS) return cached.value;

  const value = await fs.promises.realpath(filePath).catch(() => filePath);
  cache.set(filePath, { value, at: now });
  return value;
};

export const clearRealPathCache = () => cache.clear();
