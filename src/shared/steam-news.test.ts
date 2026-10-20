import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as news from "./steam-news.ts";

const { getSteamNewsImage, getSteamNewsSnippet, parseSteamNews } = news;

describe("Steam news", () => {
  it("finds the first picture in BBCode, HTML or a clan image", () => {
    assert.equal(
      getSteamNewsImage(
        '[p]Hi[/p][img src="{STEAM_CLAN_IMAGE}/35210272/abc.png"][/img]'
      ),
      "https://clan.akamai.steamstatic.com/images/35210272/abc.png"
    );
    assert.equal(
      getSteamNewsImage('<p>x</p><img src="https://example.com/a.jpg"/>'),
      "https://example.com/a.jpg"
    );
    assert.equal(getSteamNewsImage("[img]http://plain.com/a.png[/img]"), null);
    assert.equal(getSteamNewsImage("no pictures"), null);
  });

  it("turns a post into plain text and cuts it at a word", () => {
    assert.equal(
      getSteamNewsSnippet(
        '[p]Chrome up, [b]chooms[/b]! &amp; more[/p][img src="{STEAM_CLAN_IMAGE}/1/a.png"][/img][p]See https://x.y/z now[/p]'
      ),
      "Chrome up, chooms! & more See now"
    );
    assert.equal(
      getSteamNewsSnippet("one two three four five six", 15),
      "one two three…"
    );
  });

  it("keeps complete items only", () => {
    const items = parseSteamNews(
      {
        appnews: {
          newsitems: [
            {
              gid: "1",
              title: "Update 2.5",
              url: "https://store.steampowered.com/news/1",
              author: "Dev",
              contents: "[p]Patch notes[/p]",
              date: 1_792_490_433,
            },
            { gid: "2", title: "No url", date: 1 },
            {
              gid: "3",
              title: "Insecure",
              url: "http://example.com",
              date: 1,
            },
          ],
        },
      },
      "1091500"
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].appId, "1091500");
    assert.equal(items[0].snippet, "Patch notes");
    assert.equal(items[0].date, new Date(1_792_490_433_000).toISOString());
    assert.deepEqual(parseSteamNews(null, "1"), []);
  });
});
