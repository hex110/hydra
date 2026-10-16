import stringArgv from "string-argv";

const commandPlaceholder = "%command%";
const envVariableNameRegex = /^[A-Za-z_][A-Za-z0-9_]*$/;
// Wine reads every override from one variable, so both sides must survive.
const listEnvSeparators: Record<string, string> = {
  WINEDLLOVERRIDES: ";",
};

interface LaunchOptionParts {
  env: [string, string][];
  wrappers: string[];
  args: string[];
}

const splitEnvAssignment = (token: string): [string, string] | null => {
  const separatorIndex = token.indexOf("=");
  if (separatorIndex <= 0) return null;

  const name = token.slice(0, separatorIndex);
  if (!envVariableNameRegex.test(name)) return null;

  return [name, token.slice(separatorIndex + 1)];
};

const splitLaunchOptions = (tokens: string[]): LaunchOptionParts => {
  const commandIndex = tokens.indexOf(commandPlaceholder);

  if (commandIndex === -1) {
    return { env: [], wrappers: [], args: tokens };
  }

  const env: [string, string][] = [];
  let wrapperStart = 0;

  while (wrapperStart < commandIndex) {
    const assignment = splitEnvAssignment(tokens[wrapperStart]);
    if (!assignment) break;
    env.push(assignment);
    wrapperStart += 1;
  }

  return {
    env,
    wrappers: tokens.slice(wrapperStart, commandIndex),
    args: tokens.slice(commandIndex + 1),
  };
};

const mergeEnv = (
  defaults: [string, string][],
  overrides: [string, string][]
) => {
  const merged = new Map<string, string>(defaults);

  for (const [name, value] of overrides) {
    const separator = listEnvSeparators[name];
    const existing = merged.get(name);

    merged.set(
      name,
      separator && existing ? `${existing}${separator}${value}` : value
    );
  }

  return [...merged.entries()];
};

const quoteToken = (token: string) => {
  if (token === "") return '""';
  if (!/\s/.test(token)) return token;
  if (!token.includes('"')) return `"${token}"`;
  if (!token.includes("'")) return `'${token}'`;
  return token;
};

/**
 * Combines the global default launch options with a game's own options.
 * Environment variables from both are kept (the game wins on conflicts),
 * default wrappers run outside the game's wrappers, and default arguments
 * come before the game's arguments.
 */
export const applyDefaultLaunchOptions = (
  defaultLaunchOptions: string | null | undefined,
  gameLaunchOptions: string | null | undefined,
  ignoreDefaults = false
): string | null => {
  const gameOptions = gameLaunchOptions?.trim() || null;
  const defaults = defaultLaunchOptions?.trim();

  if (ignoreDefaults || !defaults) return gameOptions;
  if (!gameOptions) return defaults;

  const defaultParts = splitLaunchOptions(stringArgv(defaults));
  const gameParts = splitLaunchOptions(stringArgv(gameOptions));

  const env = mergeEnv(defaultParts.env, gameParts.env);
  const wrappers = [...defaultParts.wrappers, ...gameParts.wrappers];
  const args = [...defaultParts.args, ...gameParts.args];
  const needsCommand = env.length > 0 || wrappers.length > 0;

  // Env tokens keep the quoting string-argv left in them, so pass them as-is.
  return [
    ...env.map(([name, value]) => `${name}=${value}`),
    ...[
      ...wrappers,
      ...(needsCommand ? [commandPlaceholder] : []),
      ...args,
    ].map(quoteToken),
  ].join(" ");
};
