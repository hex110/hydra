export type SteamAppInstallState =
  | { state: "none" }
  | { state: "installed" }
  | {
      state: "downloading";
      /** 0 to 1; null before Steam has worked out the size. */
      progress: number | null;
    };
