import { setTimeout as sleep } from "node:timers/promises";
import axios, { AxiosInstance } from "axios";
import parseTorrent from "parse-torrent";
import type {
  TorBoxUserRequest,
  TorBoxTorrentInfo,
  TorBoxTorrentInfoRequest,
  TorBoxAddTorrentRequest,
  TorBoxRequestLinkRequest,
  TorBoxWebDownloadInfo,
  TorBoxWebDownloadListRequest,
  TorBoxCreateWebDownloadRequest,
  TorBoxHoster,
  TorBoxHostersRequest,
} from "@types";
import { appVersion } from "@main/constants";
import { DownloadError } from "@shared";
import { logger } from "../logger";
import { buildTorBoxDownloadManifest, type TorBoxSource } from "./torbox-files";
import {
  buildTorBoxWebManifest,
  isNotCachedReason,
  isWebDownloadFailed,
  isWebDownloadReady,
  resolveTorBoxWebDownload,
  type TorBoxWebResolution,
} from "./torbox-web";

const READINESS_POLL_ATTEMPTS = 6;
const READINESS_POLL_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 20_000;
const MY_LIST_PAGE_SIZE = 1000;
const MY_LIST_MAX_PAGES = 10;
const LINK_REQUEST_INTERVAL_MS = 250;
const WEB_READINESS_POLL_ATTEMPTS = 4;
const WEB_READINESS_POLL_DELAY_MS = 750;
const HOSTERS_CACHE_MS = 10 * 60 * 1000;

export class TorBoxClient {
  private static instance: AxiosInstance;
  private static readonly baseURL = "https://api.torbox.app/v1/api";
  private static apiToken: string;
  private static lastLinkRequestAt = 0;
  private static linkRequestQueue: Promise<void> = Promise.resolve();

  static authorize(apiToken: string) {
    this.apiToken = apiToken;
    this.instance = axios.create({
      baseURL: this.baseURL,
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "User-Agent": `Hydra/${appVersion}`,
      },
    });
  }

  private static async addMagnet(magnet: string, cachedOnly = false) {
    const form = new FormData();
    form.append("magnet", magnet);
    form.append("allow_zip", "false");
    if (cachedOnly) form.append("add_only_if_cached", "true");

    const response = await this.instance.post<TorBoxAddTorrentRequest>(
      "/torrents/createtorrent",
      form,
      { validateStatus: () => true }
    );

    if (!response.data?.success || response.status >= 400) {
      const detail = response.data?.detail;
      const reason = `${response.data?.error ?? ""} ${detail ?? ""}`;
      throw new Error(
        cachedOnly && /not[\s_-]?cached|uncached/i.test(reason)
          ? DownloadError.NotCachedOnTorBox
          : detail || DownloadError.TorrentFilesUnavailable
      );
    }

    return response.data.data;
  }

  static async getTorrentInfo(id: number) {
    const searchParams = new URLSearchParams({
      id: id.toString(),
      bypass_cache: "true",
    });

    const response = await this.instance.get<
      Omit<TorBoxTorrentInfoRequest, "data"> & {
        data: TorBoxTorrentInfo | TorBoxTorrentInfo[] | null;
      }
    >("/torrents/mylist?" + searchParams.toString());

    const { data } = response.data;

    if (!data) return null;

    if (Array.isArray(data)) {
      return data.find((item) => item.id === id) ?? null;
    }

    return data.id === id ? data : null;
  }

  static async getUser() {
    const response = await this.instance.get<TorBoxUserRequest>(`/user/me`);
    return response.data.data;
  }

  static async requestLink(
    id: number,
    fileId: number,
    signal?: AbortSignal,
    source: TorBoxSource = "torrent"
  ) {
    const slot = this.linkRequestQueue.then(async () => {
      signal?.throwIfAborted();
      const delay = Math.max(
        0,
        this.lastLinkRequestAt + LINK_REQUEST_INTERVAL_MS - Date.now()
      );
      if (delay) await sleep(delay, undefined, { signal });
      signal?.throwIfAborted();
      this.lastLinkRequestAt = Date.now();
    });
    this.linkRequestQueue = slot.catch(() => undefined);
    await slot;
    const searchParams = new URLSearchParams({
      token: this.apiToken,
      [source === "web" ? "web_id" : "torrent_id"]: id.toString(),
    });
    searchParams.set("file_id", fileId.toString());
    searchParams.set("zip_link", "false");

    const response = await this.instance.get<TorBoxRequestLinkRequest>(
      `/${source === "web" ? "webdl" : "torrents"}/requestdl?` +
        searchParams.toString(),
      { signal }
    );

    const { success, detail, data } = response.data;

    if (!success || typeof data !== "string" || !data) {
      logger.error(
        `[TorBox] requestdl did not return a link for ${source} ${id}: ${detail}`
      );

      throw new Error(DownloadError.TorBoxLinkUnavailable);
    }

    return data;
  }

  private static async getAllTorrentsFromUser() {
    const torrents: TorBoxTorrentInfo[] = [];

    for (let page = 0; page < MY_LIST_MAX_PAGES; page++) {
      const searchParams = new URLSearchParams({
        bypass_cache: "true",
        offset: (page * MY_LIST_PAGE_SIZE).toString(),
        limit: MY_LIST_PAGE_SIZE.toString(),
      });

      const response = await this.instance.get<TorBoxTorrentInfoRequest>(
        "/torrents/mylist?" + searchParams.toString()
      );

      const entries = response.data.data ?? [];
      torrents.push(...entries);

      if (entries.length < MY_LIST_PAGE_SIZE) break;
    }

    return torrents;
  }

  private static isReady(torrent: TorBoxTorrentInfo) {
    return Boolean(torrent.download_finished && torrent.download_present);
  }

  private static async waitForTorrentReady(id: number) {
    for (let attempt = 1; attempt <= READINESS_POLL_ATTEMPTS; attempt++) {
      const torrent = await this.getTorrentInfo(id);

      if (torrent && this.isReady(torrent)) return torrent;

      logger.log(
        `[TorBox] Torrent ${id} not downloadable yet (state=${torrent?.download_state ?? "unknown"}, finished=${torrent?.download_finished}, present=${torrent?.download_present}, attempt ${attempt}/${READINESS_POLL_ATTEMPTS})`
      );

      if (attempt < READINESS_POLL_ATTEMPTS) {
        await new Promise((resolve) =>
          setTimeout(resolve, READINESS_POLL_DELAY_MS)
        );
      }
    }

    throw new Error(DownloadError.TorBoxTorrentNotReady);
  }

  private static async getDownloadableTorrent(
    magnetUri: string,
    cachedOnly = false
  ) {
    const { infoHash } = await parseTorrent(magnetUri);

    if (!infoHash) throw new Error(DownloadError.InvalidMagnet);

    const normalizedInfoHash = infoHash.toLowerCase();
    const userTorrents = await this.getAllTorrentsFromUser();

    const matchingTorrents = userTorrents.filter(
      (torrent) => torrent.hash?.toLowerCase() === normalizedInfoHash
    );
    const userTorrent =
      matchingTorrents.find((torrent) => this.isReady(torrent)) ??
      matchingTorrents[0];

    if (userTorrent) {
      if (this.isReady(userTorrent)) {
        return userTorrent;
      }

      return this.waitForTorrentReady(userTorrent.id);
    }

    const torrent = await this.addMagnet(magnetUri, cachedOnly);
    const readyTorrent = await this.waitForTorrentReady(torrent.torrent_id);

    return { ...readyTorrent, name: readyTorrent.name || torrent.name };
  }

  static async getDownloadFiles(uri: string, cachedOnly = false) {
    const torrent = await this.getDownloadableTorrent(uri, cachedOnly);
    const { name } = await parseTorrent(uri);
    return buildTorBoxDownloadManifest(
      torrent,
      typeof name === "string" ? name : name?.[0]
    );
  }

  private static hosters: { at: number; list: TorBoxHoster[] } | null = null;

  /** Public list of hosters TorBox fetches; null when it cannot be read. */
  private static async getHosters(): Promise<TorBoxHoster[] | null> {
    if (this.hosters && Date.now() - this.hosters.at < HOSTERS_CACHE_MS) {
      return this.hosters.list;
    }
    try {
      const response =
        await this.instance.get<TorBoxHostersRequest>("/webdl/hosters");
      const list = response.data?.data;
      if (!Array.isArray(list)) return null;
      this.hosters = { at: Date.now(), list };
      return list;
    } catch (error) {
      logger.warn("[TorBox] Could not read the hoster list", error);
      return null;
    }
  }

  /** Account, rate-limit and outage answers end the download; anything else is read from the body. */
  private static assertWebStatus(status: number) {
    if (status === 401 || status === 403) {
      throw new Error(DownloadError.TorBoxAccountNotAuthorized);
    }
    if (status === 429) throw new Error(DownloadError.TorBoxRateLimitExceeded);
    if (status >= 500) throw new Error(DownloadError.TorBoxUnavailable);
  }

  static async getWebDownload(
    id: number
  ): Promise<TorBoxWebDownloadInfo | null> {
    const searchParams = new URLSearchParams({
      id: id.toString(),
      bypass_cache: "true",
    });
    const response = await this.instance.get<TorBoxWebDownloadListRequest>(
      "/webdl/mylist?" + searchParams.toString(),
      { validateStatus: (status) => status < 500 }
    );
    this.assertWebStatus(response.status);
    const data = response.data?.data;
    if (!data) return null;
    if (Array.isArray(data)) return data.find((item) => item.id === id) ?? null;
    return data.id === id ? data : null;
  }

  private static async listWebDownloads(): Promise<TorBoxWebDownloadInfo[]> {
    const downloads: TorBoxWebDownloadInfo[] = [];
    for (let page = 0; page < MY_LIST_MAX_PAGES; page++) {
      const searchParams = new URLSearchParams({
        bypass_cache: "true",
        offset: (page * MY_LIST_PAGE_SIZE).toString(),
        limit: MY_LIST_PAGE_SIZE.toString(),
      });
      const response = await this.instance.get<TorBoxWebDownloadListRequest>(
        "/webdl/mylist?" + searchParams.toString()
      );
      const entries = Array.isArray(response.data.data)
        ? response.data.data
        : [];
      downloads.push(...entries);
      if (entries.length < MY_LIST_PAGE_SIZE) break;
    }
    return downloads;
  }

  /**
   * Adds a link as a TorBox web download. With `cachedOnly`, TorBox refuses a
   * link it would have to fetch first and this returns null instead.
   */
  private static async createWebDownload(
    link: string,
    cachedOnly: boolean
  ): Promise<number | null> {
    const body = new URLSearchParams({ link });
    if (cachedOnly) body.set("add_only_if_cached", "true");

    const response = await this.instance.post<TorBoxCreateWebDownloadRequest>(
      "/webdl/createwebdownload",
      body,
      { validateStatus: () => true }
    );
    const { status, data } = response;
    this.assertWebStatus(status);

    const id = data?.data?.webdownload_id;
    if (data?.success && typeof id === "number") return id;

    const reason = `${data?.error ?? ""} ${data?.detail ?? ""}`.trim();
    if (cachedOnly) {
      if (!isNotCachedReason(reason)) {
        logger.warn(
          `[TorBox] Cache check for a web link failed (${status}): ${reason}`
        );
      }
      return null;
    }
    logger.error(`[TorBox] Could not add a web link (${status}): ${reason}`);
    throw new Error(data?.detail || DownloadError.TorBoxLinkUnavailable);
  }

  private static async waitForWebDownloadReady(
    id: number,
    attempts: number
  ): Promise<TorBoxWebDownloadInfo | null> {
    let info: TorBoxWebDownloadInfo | null = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      info = await this.getWebDownload(id);
      if (!info || isWebDownloadFailed(info) || isWebDownloadReady(info)) {
        return info;
      }
      if (attempt < attempts) await sleep(WEB_READINESS_POLL_DELAY_MS);
    }
    return info;
  }

  /**
   * Settles which of the links TorBox downloads: one it already holds, else
   * the first it has cached, else the first link, which TorBox then fetches
   * while the caller waits. `knownId` is a web download made earlier.
   */
  static async resolveWebDownload(
    uris: string[],
    knownId?: number
  ): Promise<TorBoxWebResolution> {
    const resolution = await resolveTorBoxWebDownload(
      {
        getHosters: () => this.getHosters(),
        listDownloads: () => this.listWebDownloads(),
        getDownload: (id) => this.getWebDownload(id),
        createDownload: (link, cachedOnly) =>
          this.createWebDownload(link, cachedOnly),
        waitUntilReady: (id) =>
          this.waitForWebDownloadReady(id, WEB_READINESS_POLL_ATTEMPTS),
      },
      uris,
      knownId
    );
    logger.log(
      `[TorBox] Web download ${resolution.webId}: ${
        resolution.cached ? "already on TorBox" : "TorBox fetches it"
      } (${uris.length} link(s) offered)`
    );
    return resolution;
  }

  /** The files of a web download once TorBox has them; until then the download is pending. */
  static getWebDownloadManifest(info: TorBoxWebDownloadInfo | null) {
    if (!info || !isWebDownloadReady(info)) {
      throw new Error(DownloadError.TorBoxTorrentNotReady);
    }
    return buildTorBoxWebManifest(info);
  }
}
