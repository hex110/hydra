import type { TorBoxHoster, TorBoxWebDownloadInfo } from "@types";
import { DownloadError } from "../../../shared/constants.js";
import { TORBOX_MAX_WEB_CANDIDATES } from "../../../shared/torbox-hosters.js";
import {
  buildTorBoxDownloadManifest,
  sanitizeSegment,
  type TorBoxDownloadManifest,
} from "./torbox-files.js";

const NOT_CACHED_PATTERN = /not[\s_-]?cached|uncached/i;
const FAILED_STATE_PATTERN = /error|fail|expired|missing|invalid|cancel/i;

export const isNotCachedReason = (reason: string): boolean =>
  NOT_CACHED_PATTERN.test(reason);

export const isWebDownloadFailed = (info: TorBoxWebDownloadInfo): boolean =>
  FAILED_STATE_PATTERN.test(info.download_state ?? "") || Boolean(info.error);

export const isWebDownloadReady = (info: TorBoxWebDownloadInfo): boolean =>
  Boolean(
    info.download_finished && info.download_present && info.files?.length
  );

/** TorBox reports progress as a fraction, but a percentage is tolerated. */
export const getWebDownloadProgress = (info: TorBoxWebDownloadInfo): number => {
  const value = Number(info.progress);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(1, value > 1 ? value / 100 : value);
};

const hostOf = (uri: string): string | null => {
  try {
    return new URL(uri).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const normalizeLink = (uri: string): string => {
  try {
    const url = new URL(uri);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return uri;
  }
};

export const sameLink = (left: string, right: string): boolean =>
  normalizeLink(left) === normalizeLink(right);

/**
 * The links worth giving to TorBox: no duplicates, no magnets, and none on a
 * hoster TorBox reports as down. If that would leave nothing, the hoster list
 * is wrong or stale, so every link stays.
 */
export const pickWebCandidates = (
  uris: string[],
  hosters: TorBoxHoster[] | null
): string[] => {
  const unique: string[] = [];
  for (const uri of uris) {
    if (uri.startsWith("magnet:")) continue;
    if (unique.some((known) => sameLink(known, uri))) continue;
    unique.push(uri);
  }
  const capped = unique.slice(0, TORBOX_MAX_WEB_CANDIDATES);
  if (!hosters) return capped;

  const down = new Set(
    hosters
      .filter((hoster) => hoster.status === false)
      .flatMap((hoster) => hoster.domains.map((domain) => domain.toLowerCase()))
  );
  const working = capped.filter((uri) => {
    const host = hostOf(uri);
    if (!host) return true;
    return ![...down].some(
      (domain) => host === domain || host.endsWith(`.${domain}`)
    );
  });
  return working.length > 0 ? working : capped;
};

/**
 * Finds the download of one of these links in the user's TorBox list, so a
 * link added on the website or by an earlier attempt is not added again.
 * A finished copy wins over one still in progress.
 */
export const findExistingWebDownload = (
  list: TorBoxWebDownloadInfo[],
  candidates: string[]
): { info: TorBoxWebDownloadInfo; uri: string } | null => {
  const matches: { info: TorBoxWebDownloadInfo; uri: string; rank: number }[] =
    [];
  for (const [rank, uri] of candidates.entries()) {
    for (const info of list) {
      if (
        info.original_url &&
        sameLink(info.original_url, uri) &&
        !isWebDownloadFailed(info)
      ) {
        matches.push({ info, uri, rank });
      }
    }
  }
  matches.sort(
    (a, b) =>
      Number(isWebDownloadReady(b.info)) - Number(isWebDownloadReady(a.info)) ||
      a.rank - b.rank
  );
  return matches[0] ?? null;
};

/** A single file lands in the download folder itself; several keep TorBox's folder. */
export const buildTorBoxWebManifest = (
  info: TorBoxWebDownloadInfo
): TorBoxDownloadManifest => {
  const manifest = buildTorBoxDownloadManifest({
    ...info,
    hash: info.hash ?? "",
    magnet: "",
    download_state: "completed",
  });
  const [only] = manifest.files;
  if (manifest.files.length === 1 && only) {
    const filename = sanitizeSegment(only.path.split("/").at(-1) ?? "");
    if (!filename) throw new Error("TorBox returned an unsafe file path.");
    return {
      ...manifest,
      name: filename,
      source: "web",
      files: [{ ...only, path: filename }],
    };
  }
  return { ...manifest, source: "web" };
};

export interface TorBoxWebResolution {
  /** The link TorBox holds, one of the links offered. */
  uri: string;
  webId: number;
  /** Fraction TorBox has fetched, 0 to 1. */
  progress: number;
  /** Null while TorBox has not listed a download it just accepted. */
  info: TorBoxWebDownloadInfo | null;
  /** A copy was already on TorBox, so nothing had to be fetched. */
  cached: boolean;
  /** The links after `uri`, in order, to fall back on if TorBox fails to fetch it. */
  remaining: string[];
}

/** What settling on a link needs from TorBox. */
export interface TorBoxWebApi {
  getHosters(): Promise<TorBoxHoster[] | null>;
  listDownloads(): Promise<TorBoxWebDownloadInfo[]>;
  getDownload(id: number): Promise<TorBoxWebDownloadInfo | null>;
  /** Null when `cachedOnly` and TorBox does not have the link cached. */
  createDownload(link: string, cachedOnly: boolean): Promise<number | null>;
  /** Waits briefly for a just-added cached link to show its files. */
  waitUntilReady(id: number): Promise<TorBoxWebDownloadInfo | null>;
}

/** Answers about the account or TorBox's limits: another link would fail the same way. */
const ACCOUNT_ERRORS = new Set<string>([
  DownloadError.TorBoxAccountNotAuthorized,
  DownloadError.TorBoxRateLimitExceeded,
]);

const isAccountError = (error: unknown) =>
  error instanceof Error && ACCOUNT_ERRORS.has(error.message);

const resolution = (
  uri: string,
  webId: number,
  info: TorBoxWebDownloadInfo | null,
  cached: boolean,
  remaining: string[]
): TorBoxWebResolution => ({
  uri,
  webId,
  progress: info ? getWebDownloadProgress(info) : 0,
  info,
  cached,
  remaining,
});

/**
 * Settles which of the links TorBox downloads: a copy it already holds (an
 * earlier attempt, or one added on its website), else the first link it has
 * cached, else the first link TorBox accepts to fetch while the caller waits.
 * A link TorBox refuses or fails to fetch gives way to the next one.
 * `knownId` is a web download made earlier for `uris[0]`.
 */
export const resolveTorBoxWebDownload = async (
  api: TorBoxWebApi,
  uris: string[],
  knownId?: number
): Promise<TorBoxWebResolution> => {
  let links = uris;
  if (knownId !== undefined) {
    const known = await api.getDownload(knownId);
    if (known && !isWebDownloadFailed(known)) {
      return resolution(uris[0], knownId, known, false, uris.slice(1));
    }
    if (known) {
      // TorBox gave up on this link; the others are still worth a try.
      links = uris.slice(1);
      if (links.length === 0) {
        throw new Error(DownloadError.TorBoxWebDownloadFailed);
      }
    }
  }

  const candidates = pickWebCandidates(links, await api.getHosters());
  if (candidates.length === 0) {
    throw new Error(DownloadError.TorBoxLinkUnavailable);
  }
  const after = (uri: string) => candidates.filter((link) => link !== uri);

  const existing = findExistingWebDownload(
    await api.listDownloads(),
    candidates
  );
  if (existing) {
    return resolution(
      existing.uri,
      existing.info.id,
      existing.info,
      true,
      after(existing.uri)
    );
  }

  for (const uri of candidates) {
    const id = await api.createDownload(uri, true);
    if (id === null) continue;
    const info = await api.waitUntilReady(id);
    if (info && isWebDownloadFailed(info)) continue;
    return resolution(uri, id, info, true, after(uri));
  }

  let lastError: unknown = new Error(DownloadError.TorBoxLinkUnavailable);
  for (const [index, uri] of candidates.entries()) {
    try {
      const id = await api.createDownload(uri, false);
      if (id === null) continue;
      const info = await api.getDownload(id);
      if (info && isWebDownloadFailed(info)) {
        lastError = new Error(DownloadError.TorBoxWebDownloadFailed);
        continue;
      }
      return resolution(uri, id, info, false, candidates.slice(index + 1));
    } catch (error) {
      if (isAccountError(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
};
