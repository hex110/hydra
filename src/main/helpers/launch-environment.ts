export interface LaunchEnvironmentOptions {
  /** DLL names (without ".dll") Wine must load from the game folder first. */
  nativeDlls: string[];
  /** DLL names (without ".dll") Wine must not load at all. */
  disabledDlls?: string[];
}

/**
 * Launch options carrying the DLL overrides Hydra adds on Linux, to be layered
 * under the user's own launch options (theirs win on conflicts, and
 * WINEDLLOVERRIDES lists are joined). Null when nothing is added.
 */
export const buildLaunchEnvironment = ({
  nativeDlls,
  disabledDlls = [],
}: LaunchEnvironmentOptions): string | null => {
  const variables: string[] = [];

  const overrides = [
    ...new Set(nativeDlls.map((dll) => `${dll.toLowerCase()}=n,b`)),
    ...new Set(disabledDlls.map((dll) => `${dll.toLowerCase()}=d`)),
  ];
  if (overrides.length > 0) {
    variables.push(`WINEDLLOVERRIDES=${overrides.join(";")}`);
  }

  return variables.length > 0 ? `${variables.join(" ")} %command%` : null;
};
