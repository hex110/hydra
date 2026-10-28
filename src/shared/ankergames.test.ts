import { describe, it } from "node:test";
import assert from "node:assert";
import {
  isAnkerGamesUri,
  matchBrowserDownload,
  parseAnkerGamesPageUri,
  parseGamePage,
  parseGameSitemap,
  parseSitemapIndex,
  pickMainDownload,
  slugMatchKey,
  toAnkerGamesRepack,
} from "./ankergames.js";
import { sourceMatchKey } from "./local-source-matching.js";

const SITEMAP_INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <sitemap><loc>https://ankergames.net/sitemap_main.xml</loc></sitemap>
    <sitemap>
        <loc>https://ankergames.net/sitemap_post_1.xml</loc>
    </sitemap>
    <sitemap><loc>https://ankergames.net/sitemap_post_2.xml</loc></sitemap>
    <sitemap><loc>https://ankergames.net/sitemap_image_1.xml</loc></sitemap>
</sitemapindex>`;

const GAME_SITEMAP = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>https://ankergames.net/game/chants-of-sennaar</loc>
        <lastmod>2026-03-09T10:00:00Z</lastmod>
    </url>
    <url><loc>https://ankergames.net/game/the-sims-4</loc></url>
    <url><loc>https://ankergames.net/article/news</loc></url>
</urlset>`;

const gamePage = (rows: string) => `<html><head>
<title>7 Days To Die Free Download (v3.4.0 B6) | AnkerGames</title>
<script type="application/ld+json">[{"@context":"https://schema.org","@type":"VideoGame","name":"7 Days To Die","softwareVersion":"v3.4.0 B6","fileSize":"16.3 GB","dateModified":"2026-10-28"},{"@type":"BreadcrumbList","name":"Home"}]</script>
</head><body>
<template x-if="downloadOpen"><div><ul>${rows}</ul></div></template>
</body></html>`;

const row = (label: string, id: number) =>
  `<li class="py-4"><div><div>${label}</div><div><a href="#" @click.prevent="generateDownloadUrl(${id})"><span>Download</span><svg><path d="M0"/></svg></a></div></div></li>`;

describe("AnkerGames URIs", () => {
  it("reads the slug of a game page", () => {
    assert.strictEqual(
      parseAnkerGamesPageUri("https://ankergames.net/game/chants-of-sennaar"),
      "chants-of-sennaar"
    );
    assert.strictEqual(
      parseAnkerGamesPageUri("https://ankergames.net/download/abc"),
      null
    );
    assert.strictEqual(
      isAnkerGamesUri("https://ankergames.net/game/../download"),
      false
    );
  });

  it("matches slugs to catalogue titles", () => {
    assert.strictEqual(
      slugMatchKey("marvels-spider-man-remastered"),
      sourceMatchKey("Marvel's Spider-Man Remastered")
    );
    assert.strictEqual(
      slugMatchKey("the-witcher-3-wild-hunt"),
      sourceMatchKey("The Witcher 3: Wild Hunt")
    );
  });
});

describe("AnkerGames sitemaps", () => {
  it("lists only the game sitemaps", () => {
    assert.deepStrictEqual(parseSitemapIndex(SITEMAP_INDEX), [
      "https://ankergames.net/sitemap_post_1.xml",
      "https://ankergames.net/sitemap_post_2.xml",
    ]);
  });

  it("reads game slugs and their dates", () => {
    assert.deepStrictEqual(parseGameSitemap(GAME_SITEMAP), [
      { slug: "chants-of-sennaar", lastmod: "2026-03-09T10:00:00Z" },
      { slug: "the-sims-4", lastmod: null },
    ]);
  });
});

describe("parseGamePage", () => {
  it("reads the structured data and download rows", () => {
    const page = parseGamePage(
      gamePage(row("Download", 4) + row("Online Fix", 7038))
    );
    assert.deepStrictEqual(page, {
      name: "7 Days To Die",
      version: "v3.4.0 B6",
      fileSize: "16.3 GB",
      modifiedAt: "2026-10-28",
      downloads: [
        { id: 4, label: "Download Download" },
        { id: 7038, label: "Online Fix Download" },
      ],
    });
  });

  it("returns null without game data", () => {
    assert.strictEqual(parseGamePage("<html></html>"), null);
  });
});

describe("pickMainDownload", () => {
  it("skips add-on rows", () => {
    assert.strictEqual(
      pickMainDownload([
        { id: 7038, label: "Online Fix Download" },
        { id: 4, label: "Download" },
      ])?.id,
      4
    );
    assert.strictEqual(
      pickMainDownload([{ id: 2339, label: "Direct Download" }])?.id,
      2339
    );
    assert.strictEqual(pickMainDownload([]), null);
  });
});

describe("toAnkerGamesRepack", () => {
  it("names the release so it matches the catalogue title", () => {
    const repack = toAnkerGamesRepack(
      { slug: "7-days-to-die", lastmod: "2026-10-28T07:36:02Z" },
      parseGamePage(gamePage(row("Download", 4)))
    );
    assert.strictEqual(repack.title, "7 Days To Die – V 3.4.0 B6");
    assert.strictEqual(
      sourceMatchKey(repack.title),
      sourceMatchKey("7 Days to Die")
    );
    assert.deepStrictEqual(repack.uris, [
      "https://ankergames.net/game/7-days-to-die",
    ]);
    assert.strictEqual(repack.fileSize, "16.3 GB");
    assert.strictEqual(repack.uploadDate, "2026-10-28T07:36:02.000Z");
  });

  it("falls back to the slug when the page is unavailable", () => {
    const repack = toAnkerGamesRepack(
      { slug: "chants-of-sennaar", lastmod: null },
      null
    );
    assert.strictEqual(repack.title, "Chants Of Sennaar");
    assert.strictEqual(repack.uploadDate, null);
  });
});

describe("matchBrowserDownload", () => {
  const slug = "chants-of-sennaar";

  it("finds the finished archive", () => {
    assert.deepStrictEqual(
      matchBrowserDownload(
        [
          "notes.txt",
          "Hades-AnkerGames.zip",
          "Chants-of-Sennaar-AnkerGames.zip",
        ],
        slug
      ),
      { file: "Chants-of-Sennaar-AnkerGames.zip", partial: null }
    );
  });

  it("waits while Firefox or Chromium is still writing", () => {
    assert.deepStrictEqual(
      matchBrowserDownload(
        [
          "Chants-of-Sennaar-AnkerGames.zip",
          "Chants-of-Sennaar-AnkerGames.zip.part",
        ],
        slug
      ),
      { file: null, partial: "Chants-of-Sennaar-AnkerGames.zip.part" }
    );
    assert.deepStrictEqual(
      matchBrowserDownload(
        ["Chants-of-Sennaar-AnkerGames.zip.crdownload"],
        slug
      ),
      { file: null, partial: "Chants-of-Sennaar-AnkerGames.zip.crdownload" }
    );
  });

  it("prefers the newer duplicate and ignores other games", () => {
    assert.strictEqual(
      matchBrowserDownload(
        [
          "Chants-of-Sennaar-AnkerGames.zip",
          "Chants-of-Sennaar-AnkerGames(1).zip",
          "Chants-of-Sennaar-2-AnkerGames.zip",
        ],
        slug
      ).file,
      "Chants-of-Sennaar-AnkerGames(1).zip"
    );
    assert.deepStrictEqual(
      matchBrowserDownload(["Other-AnkerGames.zip"], slug),
      {
        file: null,
        partial: null,
      }
    );
  });
});
