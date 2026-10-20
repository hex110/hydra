export const HOME_SHELVES = [
  "activity",
  "continue_playing",
  "downloads",
  "updates",
  "recently_added",
  "almost_done",
  "backlog",
  "wishlist",
  "friends",
  "news",
  "suggestions",
  "catalogue",
] as const;

export type HomeShelfId = (typeof HOME_SHELVES)[number];

export interface HomeShelfLayout {
  order: HomeShelfId[];
  hidden: HomeShelfId[];
}

export const HOME_SHELVES_STORAGE_KEY = "home-shelves";

export const DEFAULT_HOME_SHELF_LAYOUT: HomeShelfLayout = {
  order: [...HOME_SHELVES],
  hidden: [],
};

const isShelfId = (value: unknown): value is HomeShelfId =>
  HOME_SHELVES.includes(value as HomeShelfId);

/**
 * The stored layout, cleaned up: unknown ids dropped, shelves added in a later
 * version slotted in where they sit by default.
 */
export const parseHomeShelfLayout = (value: string | null): HomeShelfLayout => {
  if (!value) return DEFAULT_HOME_SHELF_LAYOUT;

  try {
    const parsed = JSON.parse(value) as { order?: unknown; hidden?: unknown };
    const order = (Array.isArray(parsed.order) ? parsed.order : []).filter(
      isShelfId
    );
    const unique = [...new Set(order)];

    for (const [index, id] of HOME_SHELVES.entries()) {
      if (unique.includes(id)) continue;
      const before = HOME_SHELVES.slice(0, index)
        .reverse()
        .find((shelf) => unique.includes(shelf));
      unique.splice(before ? unique.indexOf(before) + 1 : 0, 0, id);
    }

    return {
      order: unique,
      hidden: (Array.isArray(parsed.hidden) ? parsed.hidden : []).filter(
        isShelfId
      ),
    };
  } catch {
    return DEFAULT_HOME_SHELF_LAYOUT;
  }
};

export const moveHomeShelf = (
  layout: HomeShelfLayout,
  id: HomeShelfId,
  offset: -1 | 1
): HomeShelfLayout => {
  const index = layout.order.indexOf(id);
  const target = index + offset;
  if (index === -1 || target < 0 || target >= layout.order.length) {
    return layout;
  }
  const order = [...layout.order];
  [order[index], order[target]] = [order[target], order[index]];
  return { ...layout, order };
};

export const toggleHomeShelf = (
  layout: HomeShelfLayout,
  id: HomeShelfId
): HomeShelfLayout => ({
  ...layout,
  hidden: layout.hidden.includes(id)
    ? layout.hidden.filter((shelf) => shelf !== id)
    : [...layout.hidden, id],
});
