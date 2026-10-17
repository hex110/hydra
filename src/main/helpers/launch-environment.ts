export interface LaunchEnvironmentOptions {
  /** DLL names (without ".dll") Wine must load from the game folder first. */
  nativeDlls: string[];
}

/**
 * Launch options carrying the DLL overrides Hydra adds on Linux, to be layered
 * under the user's own launch options (theirs win on conflicts, and
 * WINEDLLOVERRIDES lists are joined). Null when nothing is added.
 */
export const buildLaunchEnvironment = ({
  nativeDlls,
}: LaunchEnvironmentOptions): string | null => {
  const variables: string[] = [];

  const dlls = [...new Set(nativeDlls.map((dll) => dll.toLowerCase()))];
  if (dlls.length > 0) {
    variables.push(
      `WINEDLLOVERRIDES=${dlls.map((dll) => `${dll}=n,b`).join(";")}`
    );
  }

  return variables.length > 0 ? `${variables.join(" ")} %command%` : null;
};
