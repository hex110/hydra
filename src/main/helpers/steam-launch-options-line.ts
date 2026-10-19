/** Stands in for the game while resolving, then becomes Steam's `%command%`. */
export const steamCommandPlaceholder = "\u0000hydra-steam-command";

const shellQuote = (value: string) =>
  /^[\w@%+=:,./-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;

/**
 * Writes a resolved launch as Steam launch options. Steam runs them through
 * a shell, so values are shell-quoted, unlike Hydra's own launch options.
 */
export const formatSteamLaunchOptions = ({
  command,
  args,
  env,
}: {
  command: string;
  args: string[];
  env: Record<string, string>;
}) => {
  const line = [
    ...Object.entries(env).map(([key, value]) => `${key}=${shellQuote(value)}`),
    ...[command, ...args].map((token) =>
      token === steamCommandPlaceholder ? "%command%" : shellQuote(token)
    ),
  ].join(" ");

  return line === "%command%" ? "" : line;
};
