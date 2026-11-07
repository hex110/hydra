import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Downloader } from "./constants.js";
import {
  getRepackUriDownloaders,
  selectUrisForDownloader,
} from "./repack-uri-groups.js";
import { isTorBoxHosterUri } from "./torbox-hosters.js";

const getDownloadersForUri = (uri: string): Downloader[] => {
  if (uri.startsWith("https://fuckingfast.co")) return [Downloader.FuckingFast];
  if (uri.startsWith("magnet:")) return [Downloader.Torrent, Downloader.TorBox];
  return isTorBoxHosterUri(uri) ? [Downloader.Gofile, Downloader.TorBox] : [];
};

const selectRepackUris = (
  repack: { uris: string[]; uriGroups?: string[][] },
  downloader: Downloader
) => selectUrisForDownloader(repack, downloader, getDownloadersForUri);

const gofile = "https://gofile.io/d/abc";
const pixeldrain = "https://pixeldrain.com/u/xyz";
const datanodes = "https://datanodes.to/q/Game.rar";
const magnet = "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567";

describe("TorBox for hoster links", () => {
  it("is offered for the hosters Hydra downloads directly", () => {
    for (const link of [gofile, pixeldrain, datanodes]) {
      assert.ok(isTorBoxHosterUri(link), link);
    }
  });

  it("is not offered for hosters TorBox does not fetch for Hydra", () => {
    assert.ok(!isTorBoxHosterUri("https://www.rootz.so/d/x"));
    assert.ok(!isTorBoxHosterUri("https://filekeeper.net/x"));
  });

  it("gets every other link of the release as an alternative", () => {
    assert.deepEqual(
      selectRepackUris(
        { uris: [gofile, pixeldrain, datanodes] },
        Downloader.TorBox
      ),
      { uri: gofile, alternativeUris: [pixeldrain, datanodes] }
    );
  });

  it("leaves other downloaders with a single link", () => {
    assert.deepEqual(
      selectRepackUris({ uris: [gofile, pixeldrain] }, Downloader.Gofile),
      { uri: gofile }
    );
  });

  it("does not turn a magnet into a link to check", () => {
    assert.deepEqual(
      selectRepackUris({ uris: [magnet, gofile] }, Downloader.TorBox),
      { uri: magnet }
    );
  });

  it("is skipped for multi-part groups, which only hosters can fetch", () => {
    const parts = [
      "https://fuckingfast.co/a#Game.part1.rar",
      "https://fuckingfast.co/b#Game.part2.rar",
    ];
    const repack = { uris: [parts[0], gofile], uriGroups: [parts] };
    assert.ok(
      !getRepackUriDownloaders(repack, parts[0], getDownloadersForUri).includes(
        Downloader.TorBox
      )
    );
    assert.deepEqual(selectRepackUris(repack, Downloader.TorBox), {
      uri: gofile,
    });
  });
});
