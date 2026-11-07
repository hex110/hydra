import { Downloader } from "./constants.js";
import { TORBOX_MAX_WEB_CANDIDATES } from "./torbox-hosters.js";

/** Hoster downloaders that can fetch every part of a URI group in order. */
export const MULTIPART_DOWNLOADERS: ReadonlySet<Downloader> = new Set([
  Downloader.Gofile,
  Downloader.PixelDrain,
  Downloader.Datanodes,
  Downloader.Mediafire,
  Downloader.FuckingFast,
  Downloader.VikingFile,
  Downloader.Rootz,
  Downloader.FileKeeper,
]);

export const MULTIPART_HOSTER_DOWNLOADS_FEATURE = "MULTIPART_HOSTER_DOWNLOADS";

/** Hosts that only the multi-part hoster downloads feature supports. */
const MULTIPART_FEATURE_URI_PREFIXES = [
  "https://fuckingfast.net",
  "https://filekeeper.net/",
];

interface UriGroupRepack {
  uris: string[];
  uriGroups?: string[][];
}

/** With the feature off, a repack keeps only the links Hydra supported before it. */
export const withoutMultipartHosterDownloads = <T extends UriGroupRepack>(
  repack: T
): T => ({
  ...repack,
  uris: Array.isArray(repack.uris)
    ? repack.uris.filter(
        (uri) =>
          !MULTIPART_FEATURE_URI_PREFIXES.some((prefix) =>
            uri.startsWith(prefix)
          )
      )
    : repack.uris,
  uriGroups: undefined,
});

const isUriGroup = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 1 &&
  value.every((part) => typeof part === "string" && part.length > 0) &&
  new Set(value).size === value.length;

/** Every part must come from the same hoster, so only shared downloaders apply. */
export const getUriGroupDownloaders = (
  group: string[],
  getDownloadersForUri: (uri: string) => Downloader[]
): Downloader[] => {
  const [first, ...rest] = group.map((uri) =>
    getDownloadersForUri(uri).filter((downloader) =>
      MULTIPART_DOWNLOADERS.has(downloader)
    )
  );
  return (first ?? []).filter((downloader) =>
    rest.every((downloaders) => downloaders.includes(downloader))
  );
};

/** What can download this option: a group's first part stands for all its parts. */
export const getRepackUriDownloaders = (
  repack: Pick<UriGroupRepack, "uriGroups">,
  uri: string,
  getDownloadersForUri: (uri: string) => Downloader[]
): Downloader[] => {
  const group = getUriGroupParts(repack, uri);
  return group
    ? getUriGroupDownloaders(group, getDownloadersForUri)
    : getDownloadersForUri(uri);
};

/**
 * The links of a repack one downloader can take, in the repack's order. TorBox
 * checks all of them for a cached copy, so it gets the rest as alternatives;
 * every other downloader uses the first.
 */
export const selectUrisForDownloader = (
  repack: UriGroupRepack,
  downloader: Downloader,
  getDownloadersForUri: (uri: string) => Downloader[]
): { uri: string; alternativeUris?: string[] } => {
  const [uri, ...rest] = repack.uris.filter((candidate) =>
    getRepackUriDownloaders(repack, candidate, getDownloadersForUri).includes(
      downloader
    )
  );
  if (downloader !== Downloader.TorBox || uri?.startsWith("magnet:")) {
    return { uri };
  }
  const alternativeUris = rest
    .filter((candidate) => !candidate.startsWith("magnet:"))
    .slice(0, TORBOX_MAX_WEB_CANDIDATES - 1);
  return alternativeUris.length > 0 ? { uri, alternativeUris } : { uri };
};

/**
 * Keeps valid URI groups and lists each group's first part in `uris`, so a
 * group appears as one download option. The first part identifies the group.
 */
export const normalizeUriGroups = <T extends UriGroupRepack>(
  repack: T,
  getDownloadersForUri: (uri: string) => Downloader[]
): T => {
  if (repack.uriGroups === undefined) return repack;

  const uris = Array.isArray(repack.uris) ? repack.uris : [];
  const uriGroups = (
    Array.isArray(repack.uriGroups) ? repack.uriGroups : []
  ).filter(
    (group) =>
      isUriGroup(group) &&
      !uris.includes(group[0]) &&
      getUriGroupDownloaders(group, getDownloadersForUri).length > 0
  );

  return {
    ...repack,
    uris: [...uris, ...uriGroups.map((group) => group[0])],
    uriGroups,
  };
};

export const getUriGroupParts = (
  repack: Pick<UriGroupRepack, "uriGroups">,
  uri: string
): string[] | undefined => repack.uriGroups?.find((group) => group[0] === uri);
