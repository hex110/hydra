const ENV_FOR_STEAMWORKS = (appId: string) =>
  `SteamAppId=${appId} SteamGameId=${appId}`;

/**
 * Launch options for running a launch entry without Steam's launcher: the
 * Steamworks variables Steam would have set, and the entry's arguments right
 * after the executable, before the player's own arguments.
 */
export const buildSteamLaunchEntryOptions = (
  appId: string,
  entryArguments: string | null,
  playerOptions: string | null | undefined
): string => {
  const entryArgs = entryArguments?.trim() ?? "";
  const player = playerOptions?.trim() ?? "";
  const placeholder = "%command%";
  const env = ENV_FOR_STEAMWORKS(appId);

  if (player.includes(placeholder)) {
    return `${env} ${player.replace(placeholder, `${placeholder} ${entryArgs}`.trim())}`;
  }

  return [env, placeholder, entryArgs, player].filter(Boolean).join(" ");
};
