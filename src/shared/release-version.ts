import type { DownloadRelease, GameInstalledVersion, GameRepack } from "@types";
import { sourceMatchKey } from "./local-source-matching.js";

interface ReleaseLike {
  title: string;
  uploadDate: string | null;
  downloadSourceId: string | null;
}

export interface ReleaseVersion {
  /** "1.2.3", "272", "22715r"; null when the name has no version. */
  version: string | null;
  /** Steam build id or similar ("25933619"). */
  build: string | null;
}

const BUILD_PATTERN = /(?:^|[^a-z0-9])(?:build|b)[\s.:#-]*(\d{3,})(?![\d.])/i;
const PREFIXED_VERSION_PATTERN =
  /(?:^|[^a-z0-9])v(?:er(?:sion)?)?[\s.]*(\d+(?:[._]\d+)*[a-z]?)(?![\w.])/i;
const DOTTED_VERSION_PATTERN =
  /(?:^|[\s._\-([–])(\d+(?:\.\d+)+[a-z]?)(?=$|[\s_\-)\]–/+])/i;

/** Reads the version and build number out of a release or folder name. */
export const parseReleaseVersion = (name: string): ReleaseVersion => {
  const build = BUILD_PATTERN.exec(name)?.[1] ?? null;
  // A build id is not a version ("Build 1578").
  const withoutBuild = name.replace(BUILD_PATTERN, " ");
  const version =
    PREFIXED_VERSION_PATTERN.exec(withoutBuild)?.[1]?.replaceAll("_", ".") ??
    DOTTED_VERSION_PATTERN.exec(withoutBuild)?.[1] ??
    null;

  return { version, build };
};

const versionParts = (version: string) =>
  version
    .toLowerCase()
    .split(".")
    .map((part) => {
      const [, digits = "0", suffix = ""] = /^(\d*)(.*)$/.exec(part) ?? [];
      return { number: Number(digits || 0), suffix };
    });

const compareVersionStrings = (left: string, right: string) => {
  const a = versionParts(left);
  const b = versionParts(right);

  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const x = a[index] ?? { number: 0, suffix: "" };
    const y = b[index] ?? { number: 0, suffix: "" };
    if (x.number !== y.number) return x.number - y.number;
    if (x.suffix !== y.suffix) return x.suffix < y.suffix ? -1 : 1;
  }

  return 0;
};

/**
 * Positive when `candidate` is newer, negative when older, 0 when equal and
 * null when the two cannot be compared (one has a build, the other a version).
 */
export const compareReleaseVersions = (
  candidate: ReleaseVersion,
  installed: ReleaseVersion
): number | null => {
  if (candidate.build && installed.build) {
    return Number(candidate.build) - Number(installed.build);
  }
  if (candidate.version && installed.version) {
    return compareVersionStrings(candidate.version, installed.version);
  }
  return null;
};

export const formatReleaseVersion = ({ version, build }: ReleaseVersion) =>
  version ?? (build ? `build ${build}` : null);

const isLater = (candidate: string | null, reference: string | null) =>
  !!candidate &&
  !!reference &&
  new Date(candidate).getTime() > new Date(reference).getTime();

/**
 * True when `repack` is a newer release of the installed one. Versions are
 * compared when both names have one; otherwise a later upload in the same
 * source with a different name counts, since sources replace an entry when
 * they publish a new version.
 */
export const isNewerRelease = (
  repack: ReleaseLike,
  installed: GameInstalledVersion
): boolean => {
  // Sources reuse a link for a new version, so only the name tells them apart.
  if (repack.title === installed.title) return false;

  const comparison = compareReleaseVersions(
    parseReleaseVersion(repack.title),
    parseReleaseVersion(installed.title)
  );
  if (comparison !== null) return comparison > 0;

  return (
    !!installed.downloadSourceId &&
    repack.downloadSourceId === installed.downloadSourceId &&
    isLater(repack.uploadDate, installed.uploadDate)
  );
};

/**
 * The repack an installed game should update to, or null. Releases from the
 * source the game was installed from are preferred, then the highest
 * version, then the latest upload. Releases named after neither the
 * installed release nor the game (DLC packs, soundtracks) are ignored.
 */
export const findAvailableUpdate = <T extends ReleaseLike>(
  repacks: T[],
  installed: GameInstalledVersion,
  gameTitle: string,
  dismissedTitles: string[] = []
): T | null => {
  const keys = new Set(
    [sourceMatchKey(installed.title), sourceMatchKey(gameTitle)].filter(Boolean)
  );

  const candidates = repacks.filter(
    (repack) =>
      !dismissedTitles.includes(repack.title) &&
      keys.has(sourceMatchKey(repack.title)) &&
      isNewerRelease(repack, installed)
  );
  if (candidates.length === 0) return null;

  const rank = (repack: T) => ({
    sameSource: repack.downloadSourceId === installed.downloadSourceId ? 1 : 0,
    version: parseReleaseVersion(repack.title),
    uploaded: repack.uploadDate ? new Date(repack.uploadDate).getTime() : 0,
  });

  return candidates.reduce((best, repack) => {
    const a = rank(repack);
    const b = rank(best);
    if (a.sameSource !== b.sameSource) {
      return a.sameSource > b.sameSource ? repack : best;
    }
    const comparison = compareReleaseVersions(a.version, b.version);
    if (comparison !== null && comparison !== 0) {
      return comparison > 0 ? repack : best;
    }
    return a.uploaded > b.uploaded ? repack : best;
  });
};

export const toDownloadRelease = (repack: GameRepack): DownloadRelease => ({
  title: repack.title,
  downloadSourceId: repack.downloadSourceId,
  downloadSourceName: repack.downloadSourceName,
  uploadDate: repack.uploadDate,
  fileSize: repack.fileSize,
  uris: repack.uris,
});
