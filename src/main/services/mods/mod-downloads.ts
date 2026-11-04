import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { db, gamesSublevel, levelKeys } from "@main/level";
import type {
  GameShop,
  ModActionErrorCode,
  ModActionResult,
  ModDownload,
} from "@types";

import { downloadToFile } from "../download-to-file";
import { logger } from "../logger";
import { SystemPath } from "../system-path";
import { WindowManager } from "../window-manager";
import { ModActivity } from "./activity";
import { ModError, ModStore } from "./mod-store";
import { getNexusModRequirements } from "./nexus";
import { requestNexusFileThroughTorBox } from "./torbox-nexus";

export interface NexusFileRequest {
  modId: number;
  fileId: number;
  name: string;
  version: string | null;
  replaces?: string;
}

interface Job {
  download: ModDownload;
  request: NexusFileRequest;
  controller: AbortController | null;
  finished: Promise<ModActionResult>;
}

/** Finished downloads stay listed this long, then drop off. */
const DONE_KEPT_MS = 10 * 60_000;
const PROGRESS_SEND_MS = 400;

const jobs = new Map<string, Job>();
let lastSent = 0;
let sendTimer: NodeJS.Timeout | null = null;

const queueFilePath = () =>
  path.join(SystemPath.getPath("userData"), "mods", "downloads.json");

const list = () =>
  [...jobs.values()]
    .map((job) => job.download)
    .sort((a, b) => a.createdAt - b.createdAt);

const persist = async () => {
  const kept = list().filter((download) => download.state !== "done");
  const filePath = queueFilePath();
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises
    .writeFile(
      filePath,
      JSON.stringify(
        kept.map((download) => ({
          download,
          request: jobs.get(download.id)?.request,
        }))
      )
    )
    .catch((error) =>
      logger.warn("[Mods] Could not save the mod download queue", error)
    );
};

const announce = (immediate = true) => {
  const send = () => {
    sendTimer = null;
    lastSent = Date.now();
    WindowManager.sendToAppWindows("on-mod-downloads-changed", list());
  };
  if (immediate) {
    if (sendTimer) clearTimeout(sendTimer);
    send();
    void persist();
    return;
  }
  if (sendTimer) return;
  sendTimer = setTimeout(
    send,
    Math.max(0, PROGRESS_SEND_MS - (Date.now() - lastSent))
  );
};

const update = (job: Job, patch: Partial<ModDownload>, immediate = true) => {
  job.download = { ...job.download, ...patch, updatedAt: Date.now() };
  announce(immediate);
};

const readTorBoxToken = async () => {
  const preferences = await db
    .get<
      string,
      { torBoxApiToken?: string | null } | null
    >(levelKeys.userPreferences, { valueEncoding: "json" })
    .catch(() => null);
  return preferences?.torBoxApiToken ?? null;
};

const errorCode = (error: unknown): ModActionErrorCode =>
  error instanceof ModError ? error.code : "failed";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const fail = async (
  job: Job,
  code: ModActionErrorCode,
  message: string
): Promise<ModActionResult> => {
  const { download } = job;
  update(job, { state: "failed", error: code, errorMessage: message });
  await ModActivity.append(download.shop, download.objectId, {
    kind: "download-failed",
    modName: download.modName,
    message: `Download of ${download.fileName} failed: ${message}`,
    details: { code, key: download.key },
  });
  return { ok: false, error: code };
};

const run = async (job: Job): Promise<ModActionResult> => {
  const { download, request } = job;
  const { shop, objectId } = download;
  const controller = new AbortController();
  job.controller = controller;
  update(job, {
    state: "waiting-torbox",
    progress: null,
    bytesLoaded: null,
    bytesTotal: null,
    error: null,
    errorMessage: null,
  });

  let downloaded: string | null = null;
  const startedAt = Date.now();
  try {
    const { nexusGame } = await ModStore.readState(shop, objectId);
    if (!nexusGame) return await fail(job, "failed", "no Nexus game match");
    const token = await readTorBoxToken();
    if (!token) return await fail(job, "no-torbox", "TorBox is not set up");

    await ModActivity.append(shop, objectId, {
      kind: "download-requested",
      modName: download.modName,
      message: `Asked TorBox to fetch ${download.fileName} from Nexus Mods.`,
      details: {
        source: "nexus",
        gameDomain: nexusGame.domainName,
        modId: request.modId,
        fileId: request.fileId,
      },
    });

    let link: { url: string; fileName: string; requestId: number };
    try {
      link = await requestNexusFileThroughTorBox(
        token,
        {
          gameDomain: nexusGame.domainName,
          modId: request.modId,
          fileId: request.fileId,
        },
        controller.signal
      );
    } catch (error) {
      if (controller.signal.aborted)
        return await fail(job, "cancelled", "cancelled");
      logger.error("[Mods] TorBox could not fetch the Nexus file", error);
      return await fail(job, "torbox-failed", errorText(error));
    }

    update(job, { state: "downloading", progress: 0, fileName: link.fileName });
    downloaded = path.join(
      ModStore.downloadFolder(shop, objectId),
      `${request.fileId}-${link.fileName.replaceAll(/[/\\]/g, "_")}`
    );
    try {
      await downloadToFile(
        link.url,
        downloaded,
        (loaded, total) =>
          update(
            job,
            {
              progress: total ? loaded / total : null,
              bytesLoaded: loaded,
              bytesTotal: total,
            },
            false
          ),
        controller.signal
      );
    } catch (error) {
      if (controller.signal.aborted)
        return await fail(job, "cancelled", "cancelled");
      logger.error("[Mods] Download failed", error);
      return await fail(job, "download-failed", errorText(error));
    }
    const size = (await fs.promises.stat(downloaded)).size;
    await ModActivity.append(shop, objectId, {
      kind: "download-finished",
      modName: download.modName,
      message: `Downloaded ${link.fileName} (${size} bytes) in ${Math.round((Date.now() - startedAt) / 1000)} s.`,
      details: {
        fileName: link.fileName,
        sizeInBytes: size,
        torBoxRequestId: link.requestId,
      },
    });

    job.controller = null;
    update(job, { state: "installing", progress: null });
    const requirements = await getNexusModRequirements(
      nexusGame.id,
      request.modId
    ).catch((error) => {
      logger.warn("[Mods] Could not read the mod's requirements", error);
      return undefined;
    });
    const installed = await ModStore.installFromFile(
      shop,
      objectId,
      downloaded,
      {
        requirements,
        name: request.name,
        version: request.version,
        replaces: request.replaces,
        source: {
          kind: "nexus",
          gameDomain: nexusGame.domainName,
          gameId: nexusGame.id,
          modId: request.modId,
          fileId: request.fileId,
        },
      }
    );
    update(job, {
      state: "done",
      progress: 1,
      waitsForOptions: installed === null,
    });
    setTimeout(() => {
      if (jobs.get(download.id)?.download.state === "done") {
        jobs.delete(download.id);
        announce();
      }
    }, DONE_KEPT_MS);
    return { ok: true };
  } catch (error) {
    if (!(error instanceof ModError))
      logger.error("[Mods] Mod install failed", error);
    return await fail(job, errorCode(error), errorText(error));
  } finally {
    job.controller = null;
    if (downloaded) await fs.promises.rm(downloaded, { force: true });
  }
};

const start = (job: Job) => {
  job.finished = run(job);
  return job.finished;
};

/**
 * Mod downloads, kept in the main process so they survive leaving the Mods
 * page, and listed on the Downloads page and in the bottom bar.
 */
export const ModDownloads = {
  list,

  /** Queues a Nexus file; the promise settles when it is installed or fails. */
  async enqueue(
    shop: GameShop,
    objectId: string,
    request: NexusFileRequest
  ): Promise<{ id: string; finished: Promise<ModActionResult> }> {
    const key = `nexus:${request.modId}:${request.fileId}`;
    const existing = [...jobs.values()].find(
      (job) =>
        job.download.key === key &&
        job.download.shop === shop &&
        job.download.objectId === objectId &&
        job.download.state !== "failed" &&
        job.download.state !== "done"
    );
    if (existing)
      return { id: existing.download.id, finished: existing.finished };

    const game = await gamesSublevel
      .get(levelKeys.game(shop, objectId))
      .catch(() => null);
    const now = Date.now();
    const job: Job = {
      request,
      controller: null,
      finished: Promise.resolve({ ok: true }),
      download: {
        id: randomUUID(),
        shop,
        objectId,
        gameTitle: game?.title ?? objectId,
        key,
        modName: request.name,
        fileName: request.name,
        version: request.version,
        state: "waiting-torbox",
        progress: null,
        bytesLoaded: null,
        bytesTotal: null,
        error: null,
        errorMessage: null,
        waitsForOptions: false,
        createdAt: now,
        updatedAt: now,
      },
    };
    jobs.set(job.download.id, job);
    return { id: job.download.id, finished: start(job) };
  },

  retry(id: string) {
    const job = jobs.get(id);
    if (!job || job.download.state !== "failed") return false;
    void start(job);
    return true;
  },

  cancel(id: string) {
    const job = jobs.get(id);
    if (!job) return false;
    if (job.controller) {
      job.controller.abort();
      return true;
    }
    return false;
  },

  dismiss(id: string) {
    const job = jobs.get(id);
    if (
      !job ||
      (job.download.state !== "failed" && job.download.state !== "done")
    )
      return false;
    jobs.delete(id);
    announce();
    return true;
  },

  /**
   * Downloads a previous Hydra left unfinished come back as failed, with
   * Retry, so nothing is lost silently.
   */
  async restore() {
    const saved = await fs.promises
      .readFile(queueFilePath(), "utf8")
      .then(
        (text) =>
          JSON.parse(text) as {
            download: ModDownload;
            request?: NexusFileRequest;
          }[]
      )
      .catch(() => []);
    for (const { download, request } of saved) {
      if (!request || jobs.has(download.id)) continue;
      const interrupted = download.state !== "failed";
      jobs.set(download.id, {
        request,
        controller: null,
        finished: Promise.resolve({ ok: false, error: "failed" }),
        download: interrupted
          ? {
              ...download,
              state: "failed",
              error: "failed",
              errorMessage: "Hydra closed before it finished",
              progress: null,
            }
          : download,
      });
    }
    if (saved.length > 0) announce();
  },
};
