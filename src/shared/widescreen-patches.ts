/**
 * Widescreen patches Hydra can put into a game: a proxy DLL that loads an
 * `.asi` plugin, which patches the running game. They are built for one game
 * each, so a patch is only offered to the games its definition names.
 */
export interface WidescreenPatchDefinition {
  id: string;
  name: string;
  /** Steam app ids of the games it is offered for. */
  steamAppIds: string[];
  /** The author's page for the patch. */
  sourceUrl: string;
  /** The zip, pinned to a commit and checked against its hash. */
  package: {
    url: string;
    fileName: string;
    version: string;
    sha256: string;
  };
  /** Files under this folder of the zip go to the game's `Binaries/Win64`. */
  archiveFolder: string;
  /** The settings file it puts in the game folder. */
  configFile: string;
  /** The proxy DLL the zip ships, which Wine must load before its own. */
  nativeDll: string;
  /** Where the fact that it suits the game came from. */
  evidence: string;
}

const LYALL_REPOSITORY = "https://codeberg.org/Lyall/UltrawidePatches";

export const WIDESCREEN_PATCHES: WidescreenPatchDefinition[] = [
  {
    id: "suwsf-crime-boss-build",
    name: "SUWSF (Lyall)",
    steamAppIds: ["4064510"],
    sourceUrl: `${LYALL_REPOSITORY}/src/branch/main/Crime%20Boss%20Rockay%20City`,
    package: {
      url: `${LYALL_REPOSITORY}/raw/commit/05ecd55b384e495501412b2867cc76ceaaf53afd/Crime%20Boss%20Rockay%20City/CrimeBossRockayCity_SUWSF.zip`,
      fileName: "CrimeBossRockayCity_SUWSF.zip",
      version: "2025-05-17",
      sha256:
        "666e3c4f38b4f2c9fe08b0b3d2bcad258e3ef0402a0c22fb4524523794a5dbc1",
    },
    archiveFolder: "Binaries/Win64",
    configFile: "SUWSF.ini",
    nativeDll: "winmm",
    evidence:
      "MOLE (Steam 4064510) has no build of its own in Lyall's repo. The Crime Boss: Rockay City build, also Unreal Engine 5, is reported to work on it in the comments of a MOLE ultrawide video (about 2026-07); not yet checked here",
  },
];

export const findWidescreenPatch = (
  shop: string,
  objectId: string
): WidescreenPatchDefinition | null =>
  shop === "steam"
    ? (WIDESCREEN_PATCHES.find((patch) =>
        patch.steamAppIds.includes(objectId)
      ) ?? null)
    : null;
