import type { GameRepack } from "@types";
import { comparableTitle } from "./title-matching.js";

export const ANKERGAMES_ORIGIN = "https://ankergames.net";
export const ANKERGAMES_SOURCE_ID = "ankergames";
export const ANKERGAMES_SOURCE_NAME = "AnkerGames";

const GAME_PATH = "/game/";

export interface AnkerGamesSitemapEntry {
  slug: string;
  lastmod: string | null;
}

export interface AnkerGamesDownloadRow {
  id: number;
  label: string;
}

export interface AnkerGamesGamePage {
  name: string;
  version: string | null;
  fileSize: string | null;
  modifiedAt: string | null;
  downloads: AnkerGamesDownloadRow[];
}

export const ankerGamesPageUri = (slug: string) =>
  `${ANKERGAMES_ORIGIN}${GAME_PATH}${slug}`;

/** The game slug of an `https://ankergames.net/game/<slug>` URI. */
export const parseAnkerGamesPageUri = (uri: string): string | null => {
  if (!uri.startsWith(`${ANKERGAMES_ORIGIN}${GAME_PATH}`)) return null;
  const slug = uri.slice(ANKERGAMES_ORIGIN.length + GAME_PATH.length);
  return /^[a-z0-9][a-z0-9-]*$/.test(slug) ? slug : null;
};

export const isAnkerGamesUri = (uri: string) =>
  parseAnkerGamesPageUri(uri) !== null;

export const slugMatchKey = (slug: string) =>
  comparableTitle(slug.replaceAll("-", " "));

const decodeEntities = (value: string) =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&#39;", "'");

/** The game sitemaps (`sitemap_post_N.xml`) listed in the sitemap index. */
export const parseSitemapIndex = (xml: string): string[] =>
  [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map((match) => decodeEntities(match[1]))
    .filter((url) => /\/sitemap_post_\d+\.xml$/.test(url));

export const parseGameSitemap = (xml: string): AnkerGamesSitemapEntry[] => {
  const entries: AnkerGamesSitemapEntry[] = [];
  for (const [block] of xml.matchAll(/<url>[\s\S]*?<\/url>/g)) {
    const loc = /<loc>\s*([^<\s]+)\s*<\/loc>/.exec(block)?.[1];
    const slug = loc ? parseAnkerGamesPageUri(decodeEntities(loc)) : null;
    if (!slug) continue;
    const lastmod = /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/.exec(block)?.[1];
    entries.push({ slug, lastmod: lastmod ?? null });
  }
  return entries;
};

const asText = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const findVideoGame = (html: string): Record<string, unknown> | null => {
  const scripts = html.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
  );
  for (const [, body] of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      continue;
    }
    const nodes = Array.isArray(parsed) ? parsed : [parsed];
    for (const node of nodes) {
      if (
        node &&
        typeof node === "object" &&
        (node as Record<string, unknown>)["@type"] === "VideoGame"
      ) {
        return node as Record<string, unknown>;
      }
    }
  }
  return null;
};

const stripTags = (html: string) =>
  decodeEntities(
    html
      .replaceAll(/<svg[\s\S]*?<\/svg>/g, " ")
      .replaceAll(/<[^>]+>/g, " ")
      .replaceAll(/\s+/g, " ")
  ).trim();

const parseDownloadRows = (html: string): AnkerGamesDownloadRow[] => {
  const start = html.indexOf('<template x-if="downloadOpen">');
  if (start === -1) return [];
  const end = html.indexOf("</template>", start);
  const modal = html.slice(start, end === -1 ? undefined : end);

  const rows: AnkerGamesDownloadRow[] = [];
  for (const [item] of modal.matchAll(/<li\b[\s\S]*?<\/li>/g)) {
    const id = /generateDownloadUrl\((\d+)\)/.exec(item)?.[1];
    if (!id) continue;
    rows.push({ id: Number(id), label: stripTags(item) });
  }
  return rows;
};

/** Reads a game page's structured data and its download modal rows. */
export const parseGamePage = (html: string): AnkerGamesGamePage | null => {
  const game = findVideoGame(html);
  const name = asText(game?.name);
  if (!game || !name) return null;

  return {
    name: decodeEntities(name),
    version: asText(game.softwareVersion),
    fileSize: asText(game.fileSize),
    modifiedAt: asText(game.dateModified),
    downloads: parseDownloadRows(html),
  };
};

const EXTRA_ROW = /\b(online[ -]?fix|fix|patch|crack|update|dlc)\b/i;

/** The row that downloads the game itself, not an add-on such as Online Fix. */
export const pickMainDownload = (
  rows: AnkerGamesDownloadRow[]
): AnkerGamesDownloadRow | null =>
  rows.find((row) => !EXTRA_ROW.test(row.label)) ?? rows[0] ?? null;

const titleFromSlug = (slug: string) =>
  slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const toIsoDate = (value: string | null) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : new Date(time).toISOString();
};

export const toAnkerGamesRepack = (
  entry: AnkerGamesSitemapEntry,
  page: AnkerGamesGamePage | null
): GameRepack => {
  const name = page?.name ?? titleFromSlug(entry.slug);
  const version = page?.version?.replace(/^v(?=\d)/i, "");
  const uploadDate =
    toIsoDate(entry.lastmod) ?? toIsoDate(page?.modifiedAt ?? null);

  return {
    id: `${ANKERGAMES_SOURCE_ID}-${entry.slug}`,
    title: version ? `${name} – V ${version}` : name,
    fileSize: page?.fileSize ?? null,
    uris: [ankerGamesPageUri(entry.slug)],
    unavailableUris: [],
    uploadDate,
    downloadSourceId: ANKERGAMES_SOURCE_ID,
    downloadSourceName: ANKERGAMES_SOURCE_NAME,
    createdAt: new Date(0).toISOString(),
  };
};

export interface BrowserDownloadMatch {
  /** The finished archive, once the browser has written it. */
  file: string | null;
  /** The browser's in-progress file (`.part`, `.crdownload`). */
  partial: string | null;
}

const BROWSER_ARCHIVE = /^(.+?)-AnkerGames(?: ?\(\d+\))?\.(?:zip|rar|7z)$/i;
const PARTIAL_SUFFIX = /\.(?:part|crdownload)$/i;

const archiveMatchesSlug = (name: string, slug: string) => {
  const base = BROWSER_ARCHIVE.exec(name)?.[1];
  return (
    !!base &&
    comparableTitle(base.replaceAll(/[-_.]+/g, " ")) === slugMatchKey(slug)
  );
};

/**
 * Finds this game's AnkerGames archive among a folder's file names. Firefox
 * writes `<name>.part` next to an empty `<name>`, Chromium `<name>.crdownload`;
 * a newer duplicate ("Game-AnkerGames(1).zip") wins over an older one.
 */
export const matchBrowserDownload = (
  names: string[],
  slug: string
): BrowserDownloadMatch => {
  const partials = names.filter(
    (name) =>
      PARTIAL_SUFFIX.test(name) &&
      archiveMatchesSlug(name.replace(PARTIAL_SUFFIX, ""), slug)
  );
  const inProgress = new Set(
    partials.map((name) => name.replace(PARTIAL_SUFFIX, ""))
  );
  const files = names
    .filter((name) => archiveMatchesSlug(name, slug) && !inProgress.has(name))
    .sort((a, b) => b.length - a.length || b.localeCompare(a));

  return {
    file: partials.length > 0 ? null : (files[0] ?? null),
    partial: partials.sort((a, b) => b.length - a.length)[0] ?? null,
  };
};
