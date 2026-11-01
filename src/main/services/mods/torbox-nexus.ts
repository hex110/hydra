import { setTimeout as sleep } from "node:timers/promises";

import axios from "axios";

import { appVersion } from "@main/constants";
import { nexusFilePageUrl } from "@shared";

const BASE_URL = "https://api.torbox.app/v1/api";
const REQUEST_TIMEOUT_MS = 20_000;
const POLL_DELAY_MS = 2_000;
/** Nexus files are small; TorBox usually has one within seconds. */
const MAX_POLLS = 90;

export class TorBoxNexusError extends Error {}

interface TorBoxResponse<T> {
  success: boolean;
  detail?: string | null;
  error?: string | null;
  data?: T;
}

interface WebDownload {
  id: number;
  download_finished?: boolean;
  download_present?: boolean;
  download_state?: string;
  files?: { id: number; name: string; size: number }[];
}

/**
 * Has TorBox fetch a Nexus Mods file through its web downloads (it accepts a
 * file's Nexus page) and returns a direct download link with the file name.
 * Needs no Nexus account; TorBox allows 100 Nexus links a day.
 */
export const requestNexusFileThroughTorBox = async (
  apiToken: string,
  file: { gameDomain: string; modId: number; fileId: number },
  signal?: AbortSignal
): Promise<{ url: string; fileName: string }> => {
  const client = axios.create({
    baseURL: BASE_URL,
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "User-Agent": `HydraPlus/${appVersion}`,
    },
    validateStatus: () => true,
    signal,
  });

  const form = new FormData();
  form.append(
    "link",
    nexusFilePageUrl(file.gameDomain, file.modId, file.fileId)
  );
  const created = await client.post<
    TorBoxResponse<{ webdownload_id?: number; id?: number }>
  >("/webdl/createwebdownload", form);
  const webId = created.data?.data?.webdownload_id ?? created.data?.data?.id;
  if (!created.data?.success || !webId) {
    throw new TorBoxNexusError(
      created.data?.detail || created.data?.error || "TorBox refused the link"
    );
  }

  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    const list = await client.get<TorBoxResponse<WebDownload>>(
      "/webdl/mylist",
      { params: { id: webId, bypass_cache: true } }
    );
    const download = list.data?.data;
    const ready = download?.download_finished || download?.download_present;
    const target = download?.files?.[0];
    if (ready && target) {
      const link = await client.get<TorBoxResponse<string>>(
        "/webdl/requestdl",
        {
          params: { token: apiToken, web_id: webId, file_id: target.id },
        }
      );
      if (!link.data?.success || typeof link.data.data !== "string") {
        throw new TorBoxNexusError(
          link.data?.detail || "TorBox gave no download link"
        );
      }
      return {
        url: link.data.data,
        fileName: target.name.split("/").at(-1) ?? target.name,
      };
    }
    if (
      download?.download_state &&
      /error|failed/i.test(download.download_state)
    ) {
      throw new TorBoxNexusError(`TorBox: ${download.download_state}`);
    }
    await sleep(POLL_DELAY_MS, undefined, { signal });
  }

  throw new TorBoxNexusError("TorBox did not finish fetching the file");
};
