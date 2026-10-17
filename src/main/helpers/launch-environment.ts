/** Environment variables that make Proton present HDR to the game. */
export const HDR_ENVIRONMENT: Record<string, string> = {
  // HDR needs Wine's Wayland driver; under XWayland there is no HDR surface.
  PROTON_ENABLE_WAYLAND: "1",
  // Valve Proton and GE-Proton.
  PROTON_ENABLE_HDR: "1",
  // Read by DXVK and winewayland directly; Proton-CachyOS only honours this.
  DXVK_HDR: "1",
};

export interface LaunchEnvironmentOptions {
  hdr: boolean;
  /** DLL names (without ".dll") Wine must load from the game folder first. */
  nativeDlls: string[];
}

/**
 * Launch options carrying the environment Hydra adds on Linux, to be layered
 * under the user's own launch options (theirs win on conflicts, and
 * WINEDLLOVERRIDES lists are joined). Null when nothing is added.
 */
export const buildLaunchEnvironment = ({
  hdr,
  nativeDlls,
}: LaunchEnvironmentOptions): string | null => {
  const variables: string[] = [];

  const dlls = [...new Set(nativeDlls.map((dll) => dll.toLowerCase()))];
  if (dlls.length > 0) {
    variables.push(
      `WINEDLLOVERRIDES=${dlls.map((dll) => `${dll}=n,b`).join(";")}`
    );
  }

  if (hdr) {
    variables.push(
      ...Object.entries(HDR_ENVIRONMENT).map(
        ([name, value]) => `${name}=${value}`
      )
    );
  }

  return variables.length > 0 ? `${variables.join(" ")} %command%` : null;
};
