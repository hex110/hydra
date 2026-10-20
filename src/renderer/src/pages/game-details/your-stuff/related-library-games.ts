const MIN_BASE_TITLE_LENGTH = 4;
const MAX_RELATED = 8;

export const normalizeGameTitle = (title: string) =>
  title
    .replace(/[™®©]/g, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * Library games that look like another version of the title: the same name,
 * or one name followed by more words ("Dark Souls" and "Dark Souls III").
 */
export const findRelatedLibraryGames = <
  T extends { id: string; title: string },
>(
  title: string,
  games: T[],
  excludeIds: Set<string>
): T[] => {
  const base = normalizeGameTitle(title);
  if (!base) return [];

  return games
    .filter((game) => {
      if (excludeIds.has(game.id)) return false;
      const other = normalizeGameTitle(game.title);
      if (!other) return false;
      if (other === base) return true;
      const [short, long] =
        other.length < base.length ? [other, base] : [base, other];
      return (
        short.length >= MIN_BASE_TITLE_LENGTH && long.startsWith(`${short} `)
      );
    })
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, MAX_RELATED);
};
