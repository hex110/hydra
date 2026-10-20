export const LOCAL_COLLECTION_PREFIX = "local-";

/** Collections kept on this machine have ids Hydra's servers never hand out. */
export const isLocalCollectionId = (id: string) =>
  id.startsWith(LOCAL_COLLECTION_PREFIX);

/** The collection ids Hydra's servers know about. */
export const getRemoteCollectionIds = (ids: readonly string[]) =>
  ids.filter((id) => !isLocalCollectionId(id));

/** Swaps a local collection for the account collection it became. */
export const replaceCollectionId = (
  ids: readonly string[],
  from: string,
  to: string
): string[] => Array.from(new Set(ids.map((id) => (id === from ? to : id))));
