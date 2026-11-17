import fs from "node:fs";
import path from "node:path";

/** Copy progress is read off the destination's size this often. */
const MOVE_POLL_INTERVAL_MS = 500;

export interface ArchiveMove {
  done: Promise<void>;
  copied: number;
  total: number;
}

/** Moves in flight by destination, so a resumed watch joins one instead of starting another. */
const moves = new Map<string, ArchiveMove>();

/**
 * Renames the archive into place, or copies it when the browser's folder is on
 * another drive. The copy can take minutes for a big archive, so its progress
 * is kept on the returned move.
 */
export const moveArchive = (
  from: string,
  to: string,
  onCopy?: (bytes: number) => void
): ArchiveMove => {
  const existing = moves.get(to);
  if (existing) return existing;

  const move: ArchiveMove = { done: Promise.resolve(), copied: 0, total: 0 };
  move.done = (async () => {
    await fs.promises.mkdir(path.dirname(to), { recursive: true });
    try {
      await fs.promises.rename(from, to);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    }

    move.total = (await fs.promises.stat(from)).size;
    onCopy?.(move.total);
    const watch = setInterval(() => {
      fs.promises
        .stat(to)
        .then((stats) => {
          move.copied = Math.min(stats.size, move.total);
        })
        .catch(() => undefined);
    }, MOVE_POLL_INTERVAL_MS);
    try {
      await fs.promises.copyFile(from, to);
    } catch (error) {
      await fs.promises.rm(to, { force: true }).catch(() => undefined);
      throw error;
    } finally {
      clearInterval(watch);
    }
    move.copied = move.total;
    await fs.promises.unlink(from);
  })().finally(() => moves.delete(to));

  moves.set(to, move);
  return move;
};
