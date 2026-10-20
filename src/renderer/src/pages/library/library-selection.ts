/** Selected cards, by game key, plus the card a Shift-click extends from. */
export interface LibrarySelection {
  keys: ReadonlySet<string>;
  anchor: string | null;
}

export const EMPTY_SELECTION: LibrarySelection = {
  keys: new Set(),
  anchor: null,
};

export const selectOnly = (key: string): LibrarySelection => ({
  keys: new Set([key]),
  anchor: key,
});

export const toggleSelection = (
  selection: LibrarySelection,
  key: string
): LibrarySelection => {
  const keys = new Set(selection.keys);
  if (keys.has(key)) keys.delete(key);
  else keys.add(key);
  return { keys, anchor: key };
};

/** Selects every card between the anchor and `key`, in display order. */
export const selectRange = (
  selection: LibrarySelection,
  orderedKeys: readonly string[],
  key: string,
  additive: boolean
): LibrarySelection => {
  const anchorIndex = selection.anchor
    ? orderedKeys.indexOf(selection.anchor)
    : -1;
  const targetIndex = orderedKeys.indexOf(key);
  if (anchorIndex === -1 || targetIndex === -1) return selectOnly(key);

  const [from, to] =
    anchorIndex < targetIndex
      ? [anchorIndex, targetIndex]
      : [targetIndex, anchorIndex];
  const keys = new Set(additive ? selection.keys : []);
  for (const rangeKey of orderedKeys.slice(from, to + 1)) keys.add(rangeKey);
  return { keys, anchor: selection.anchor };
};

/** Drops keys that are no longer shown. */
export const pruneSelection = (
  selection: LibrarySelection,
  visibleKeys: ReadonlySet<string>
): LibrarySelection => {
  const keys = [...selection.keys].filter((key) => visibleKeys.has(key));
  if (keys.length === selection.keys.size) return selection;
  return {
    keys: new Set(keys),
    anchor:
      selection.anchor && visibleKeys.has(selection.anchor)
        ? selection.anchor
        : null,
  };
};
