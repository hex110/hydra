import { shell } from "electron";
import { logger } from "@main/services/logger";
import { WindowManager } from "@main/services/window-manager";
import {
  ANKERGAMES_ORIGIN,
  DownloadError,
  ankerGamesPageUri,
  parseAnkerGamesPageUri,
  pickMainDownload,
} from "@shared";
import { AnkerGamesCatalogue, fetchAnkerGames } from "./catalogue";

interface MintResponse {
  success?: boolean;
  download_url?: string;
  show_upgrade?: boolean;
  geo_blocked?: boolean;
  modal_type?: string;
  error?: string;
}

const isAnkerGamesPage = (value: string) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "ankergames.net" ||
        url.hostname.endsWith(".ankergames.net"))
    );
  } catch {
    return false;
  }
};

/** Asks AnkerGames for a signed download page link, as the site's Download button does. */
const mintDownloadPage = async (slug: string, downloadId: number) => {
  const referer = ankerGamesPageUri(slug);
  const tokenResponse = await fetchAnkerGames(
    `${ANKERGAMES_ORIGIN}/csrf-token`,
    { headers: { Accept: "application/json", Referer: referer } }
  );
  const { token } = (await tokenResponse.json()) as { token?: string };
  if (!token) throw new Error(DownloadError.AnkerGamesUnavailable);

  const response = await fetchAnkerGames(
    `${ANKERGAMES_ORIGIN}/generate-download-url/${downloadId}`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRF-TOKEN": token,
        Referer: referer,
      },
      body: "{}",
    }
  );
  const data = (await response.json().catch(() => ({}))) as MintResponse;

  if (
    data.success &&
    data.download_url &&
    isAnkerGamesPage(data.download_url)
  ) {
    return data.download_url;
  }
  if (data.geo_blocked) throw new Error(DownloadError.AnkerGamesRegionBlocked);
  if (data.modal_type === "subscribe") {
    throw new Error(DownloadError.AnkerGamesSubscriptionRequired);
  }
  if (data.show_upgrade) throw new Error(DownloadError.AnkerGamesLimitReached);

  logger.warn("[AnkerGames] Download link was refused", {
    slug,
    status: response.status,
    error: data.error,
  });
  throw new Error(DownloadError.AnkerGamesUnavailable);
};

/** When each game's download page was last opened in the browser. */
const openedAt = new Map<string, number>();

export const getAnkerGamesPageOpenedAt = (pageUri: string) =>
  openedAt.get(pageUri) ?? null;

/**
 * Opens AnkerGames' download page for this game in the person's browser.
 * The site runs its wait and its Cloudflare check there (Hydra's own windows
 * fail that check) and the browser saves the file, which Hydra then picks up
 * from the Downloads folder.
 */
export const openAnkerGamesDownloadPage = async (
  pageUri: string,
  title: string
) => {
  const slug = parseAnkerGamesPageUri(pageUri);
  if (!slug) throw new Error(DownloadError.AnkerGamesUnavailable);

  const page = await AnkerGamesCatalogue.getPage(slug, { fresh: true });
  const row = page ? pickMainDownload(page.downloads) : null;
  if (!row) throw new Error(DownloadError.AnkerGamesUnavailable);

  const downloadPage = await mintDownloadPage(slug, row.id);
  await shell.openExternal(downloadPage);
  openedAt.set(pageUri, Date.now());
  WindowManager.sendToAppWindows("on-ankergames-browser-opened", title);
  logger.log("[AnkerGames] Download page opened in the browser", { slug });
};
