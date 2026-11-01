/** Below this much memory, Hydra closes its window while a game runs by default. */
export const LOW_MEMORY_BYTES = 12 * 1024 ** 3;

/**
 * Whether Hydra closes its window to the tray when a game starts. Unset
 * follows the machine: a closed window frees the renderer's ~500 MB, which a
 * machine with little memory needs for the game.
 */
export const resolveHideToTrayOnGameStart = (
  preference: boolean | undefined,
  totalMemoryBytes: number
) => preference ?? totalMemoryBytes < LOW_MEMORY_BYTES;
