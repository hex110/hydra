import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TorBoxHoster, TorBoxWebDownloadInfo } from "@types";
import {
  buildTorBoxWebManifest,
  findExistingWebDownload,
  getWebDownloadProgress,
  isNotCachedReason,
  isWebDownloadFailed,
  isWebDownloadReady,
  pickWebCandidates,
  resolveTorBoxWebDownload,
  type TorBoxWebApi,
} from "./torbox-web.ts";
import { DownloadError } from "../../../shared/constants.ts";

const info = (
  overrides: Partial<TorBoxWebDownloadInfo> = {}
): TorBoxWebDownloadInfo => ({
  id: 1,
  created_at: "",
  updated_at: "",
  size: 100,
  active: true,
  cached: false,
  auth_id: "",
  download_state: "downloading",
  download_finished: false,
  download_present: false,
  seeds: 0,
  ratio: 0,
  progress: 0,
  download_speed: 0,
  upload_speed: 0,
  name: "Game",
  eta: 0,
  files: [],
  ...overrides,
});

const file = (id: number, name: string, size = 10) => ({
  id,
  md5: "",
  s3_path: "",
  name,
  size,
  mimetype: "",
  short_name: name.split("/").at(-1)!,
});

const hoster = (domains: string[], status: boolean): TorBoxHoster => ({
  name: domains[0],
  domains,
  status,
  type: "hoster",
});

describe("isNotCachedReason", () => {
  it("recognises the ways TorBox says a link is not cached", () => {
    assert.ok(isNotCachedReason("DOWNLOAD_NOT_CACHED Download is not cached"));
    assert.ok(isNotCachedReason("not_cached"));
    assert.ok(isNotCachedReason("Uncached link"));
    assert.ok(!isNotCachedReason("HOSTER_UNSUPPORTED"));
  });
});

describe("web download state", () => {
  it("is ready only with the files present", () => {
    assert.ok(!isWebDownloadReady(info()));
    assert.ok(
      !isWebDownloadReady(
        info({ download_finished: true, download_present: true })
      )
    );
    assert.ok(
      isWebDownloadReady(
        info({
          download_finished: true,
          download_present: true,
          files: [file(1, "a.rar")],
        })
      )
    );
  });

  it("is failed for error states and error messages", () => {
    assert.ok(isWebDownloadFailed(info({ download_state: "error" })));
    assert.ok(isWebDownloadFailed(info({ download_state: "failed" })));
    assert.ok(isWebDownloadFailed(info({ error: "boom" })));
    assert.ok(!isWebDownloadFailed(info({ download_state: "downloading" })));
    assert.ok(!isWebDownloadFailed(info({ download_state: "completed" })));
  });

  it("reads progress as a fraction, or as a percentage", () => {
    assert.equal(getWebDownloadProgress(info({ progress: 0.25 })), 0.25);
    assert.equal(getWebDownloadProgress(info({ progress: 50 })), 0.5);
    assert.equal(getWebDownloadProgress(info({ progress: 1 })), 1);
    assert.equal(getWebDownloadProgress(info({ progress: Number.NaN })), 0);
  });
});

describe("pickWebCandidates", () => {
  const links = [
    "https://gofile.io/d/abc",
    "https://pixeldrain.com/u/xyz",
    "https://datanodes.to/qwe/Game.rar",
  ];

  it("keeps the order and drops duplicates and magnets", () => {
    assert.deepEqual(
      pickWebCandidates(
        [links[0], "magnet:?xt=urn:btih:abc", links[1], `${links[0]}/`],
        null
      ),
      [links[0], links[1]]
    );
  });

  it("drops links on hosters TorBox reports as down", () => {
    assert.deepEqual(
      pickWebCandidates(links, [
        hoster(["gofile.io"], false),
        hoster(["pixeldrain.com", "pixeldrain.dev"], true),
      ]),
      [links[1], links[2]]
    );
  });

  it("keeps every link when the list would leave none", () => {
    assert.deepEqual(
      pickWebCandidates([links[0]], [hoster(["gofile.io"], false)]),
      [links[0]]
    );
  });

  it("caps how many links are checked", () => {
    const many = Array.from(
      { length: 20 },
      (_, i) => `https://gofile.io/d/${i}`
    );
    assert.equal(pickWebCandidates(many, null).length, 6);
  });
});

describe("findExistingWebDownload", () => {
  const ready = info({
    id: 7,
    original_url: "https://pixeldrain.com/u/xyz",
    download_finished: true,
    download_present: true,
    files: [file(1, "a.rar")],
  });
  const running = info({ id: 8, original_url: "https://gofile.io/d/abc" });

  it("prefers a finished copy over an earlier link still in progress", () => {
    const found = findExistingWebDownload(
      [running, ready],
      ["https://gofile.io/d/abc", "https://pixeldrain.com/u/xyz"]
    );
    assert.equal(found?.info.id, 7);
    assert.equal(found?.uri, "https://pixeldrain.com/u/xyz");
  });

  it("uses a copy in progress when nothing is finished", () => {
    assert.equal(
      findExistingWebDownload([running], ["https://gofile.io/d/abc"])?.info.id,
      8
    );
  });

  it("ignores failed copies, other links and entries without a link", () => {
    assert.equal(
      findExistingWebDownload(
        [
          info({ id: 1, original_url: "https://gofile.io/d/abc", error: "x" }),
          info({ id: 2 }),
          info({ id: 3, original_url: "https://gofile.io/d/other" }),
        ],
        ["https://gofile.io/d/abc"]
      ),
      null
    );
  });
});

describe("buildTorBoxWebManifest", () => {
  it("puts a single file straight in the download folder", () => {
    const manifest = buildTorBoxWebManifest(
      info({
        id: 5,
        name: "Game.rar",
        download_finished: true,
        download_present: true,
        files: [file(11, "Game.rar", 42)],
      })
    );
    assert.equal(manifest.source, "web");
    assert.equal(manifest.torrentId, 5);
    assert.deepEqual(manifest.files, [{ id: 11, path: "Game.rar", size: 42 }]);
    assert.equal(manifest.totalSize, 42);
  });

  it("keeps the folder of a multi-file download", () => {
    const manifest = buildTorBoxWebManifest(
      info({
        name: "Game",
        files: [file(1, "Game/a.rar", 10), file(2, "Game/b.rar", 20)],
      })
    );
    assert.equal(manifest.source, "web");
    assert.deepEqual(
      manifest.files.map((item) => item.path),
      ["Game/a.rar", "Game/b.rar"]
    );
  });

  it("refuses unsafe paths", () => {
    assert.throws(() =>
      buildTorBoxWebManifest(info({ files: [file(1, "../evil.rar")] }))
    );
  });
});

describe("resolveTorBoxWebDownload", () => {
  const links = [
    "https://gofile.io/d/abc",
    "https://pixeldrain.com/u/xyz",
    "https://datanodes.to/q/Game.rar",
  ];
  const finished = (id: number) =>
    info({
      id,
      download_finished: true,
      download_present: true,
      files: [file(1, "Game.rar")],
    });

  /** A TorBox where only `cachedLinks` can be added with "only if cached". */
  const fakeTorBox = (
    options: {
      cachedLinks?: string[];
      existing?: TorBoxWebDownloadInfo[];
      hosters?: TorBoxHoster[] | null;
    } = {}
  ) => {
    const calls: string[] = [];
    let nextId = 100;
    const api: TorBoxWebApi = {
      getHosters: async () => options.hosters ?? null,
      listDownloads: async () => options.existing ?? [],
      getDownload: async (id) =>
        id >= 100 ? info({ id, progress: 0.1 }) : finished(id),
      createDownload: async (link, cachedOnly) => {
        calls.push(`${cachedOnly ? "cached" : "add"}:${link}`);
        if (cachedOnly && !options.cachedLinks?.includes(link)) return null;
        return nextId++;
      },
      waitUntilReady: async (id) => finished(id),
    };
    return { api, calls };
  };

  it("takes the first link TorBox has cached and adds nothing else", async () => {
    const { api, calls } = fakeTorBox({ cachedLinks: [links[1]] });
    const resolution = await resolveTorBoxWebDownload(api, links);
    assert.equal(resolution.uri, links[1]);
    assert.equal(resolution.cached, true);
    assert.deepEqual(calls, [`cached:${links[0]}`, `cached:${links[1]}`]);
  });

  it("makes TorBox fetch the first link when none is cached", async () => {
    const { api, calls } = fakeTorBox();
    const resolution = await resolveTorBoxWebDownload(api, links);
    assert.equal(resolution.uri, links[0]);
    assert.equal(resolution.cached, false);
    assert.equal(resolution.webId, 100);
    assert.equal(resolution.progress, 0.1);
    assert.deepEqual(calls, [
      ...links.map((link) => `cached:${link}`),
      `add:${links[0]}`,
    ]);
  });

  it("reuses a copy already in the TorBox account without adding anything", async () => {
    const mine = {
      ...finished(7),
      original_url: links[2],
    };
    const { api, calls } = fakeTorBox({ existing: [mine] });
    const resolution = await resolveTorBoxWebDownload(api, links);
    assert.equal(resolution.uri, links[2]);
    assert.equal(resolution.webId, 7);
    assert.deepEqual(calls, []);
  });

  it("continues the web download made earlier", async () => {
    const { api, calls } = fakeTorBox();
    const resolution = await resolveTorBoxWebDownload(api, [links[1]], 8);
    assert.equal(resolution.uri, links[1]);
    assert.equal(resolution.webId, 8);
    assert.deepEqual(calls, []);
  });

  it("adds the link again when the earlier download is gone", async () => {
    const { api, calls } = fakeTorBox();
    api.getDownload = async (id) => (id >= 100 ? info({ id }) : null);
    const resolution = await resolveTorBoxWebDownload(api, [links[0]], 8);
    assert.equal(resolution.webId, 100);
    assert.deepEqual(calls, [`cached:${links[0]}`, `add:${links[0]}`]);
  });

  it("skips links on a hoster TorBox reports as down", async () => {
    const { api, calls } = fakeTorBox({
      hosters: [hoster(["gofile.io"], false)],
    });
    const resolution = await resolveTorBoxWebDownload(api, links);
    assert.equal(resolution.uri, links[1]);
    assert.ok(!calls.some((call) => call.includes("gofile.io")));
  });

  it("keeps the id of an accepted download TorBox has not listed yet", async () => {
    const { api } = fakeTorBox();
    api.getDownload = async () => null;
    const resolution = await resolveTorBoxWebDownload(api, [links[0]]);
    assert.equal(resolution.webId, 100);
    assert.equal(resolution.info, null);
  });

  it("fails when TorBox reports the download as failed", async () => {
    const { api } = fakeTorBox();
    api.getDownload = async (id) => info({ id, download_state: "error" });
    await assert.rejects(
      resolveTorBoxWebDownload(api, [links[0]], 8),
      new Error(DownloadError.TorBoxWebDownloadFailed)
    );
  });

  it("moves on to the next link when TorBox refuses to fetch one", async () => {
    const { api, calls } = fakeTorBox();
    const create = api.createDownload;
    api.createDownload = async (link, cachedOnly) => {
      if (!cachedOnly && link === links[0]) {
        await create(link, cachedOnly);
        throw new Error(DownloadError.TorBoxUnavailable);
      }
      return create(link, cachedOnly);
    };
    const resolution = await resolveTorBoxWebDownload(api, links);
    assert.equal(resolution.uri, links[1]);
    assert.deepEqual(resolution.remaining, [links[2]]);
    assert.deepEqual(calls.slice(-2), [`add:${links[0]}`, `add:${links[1]}`]);
  });

  it("stops at once on an account or rate-limit answer", async () => {
    const { api, calls } = fakeTorBox();
    const create = api.createDownload;
    api.createDownload = async (link, cachedOnly) => {
      if (!cachedOnly) {
        await create(link, cachedOnly);
        throw new Error(DownloadError.TorBoxRateLimitExceeded);
      }
      return create(link, cachedOnly);
    };
    await assert.rejects(
      resolveTorBoxWebDownload(api, links),
      new Error(DownloadError.TorBoxRateLimitExceeded)
    );
    assert.equal(calls.filter((call) => call.startsWith("add:")).length, 1);
  });

  it("falls back to the remaining links when the earlier fetch failed", async () => {
    const { api, calls } = fakeTorBox();
    api.getDownload = async (id) =>
      id >= 100 ? info({ id }) : info({ id, download_state: "failed" });
    const resolution = await resolveTorBoxWebDownload(api, links, 8);
    assert.equal(resolution.uri, links[1]);
    assert.equal(resolution.webId, 100);
    assert.ok(!calls.some((call) => call.includes(links[0])));
  });

  it("keeps the links it did not choose", async () => {
    const { api } = fakeTorBox({ cachedLinks: [links[1]] });
    const resolution = await resolveTorBoxWebDownload(api, links);
    assert.deepEqual(resolution.remaining, [links[0], links[2]]);
  });

  it("fails without a link TorBox could fetch", async () => {
    const { api } = fakeTorBox();
    await assert.rejects(
      resolveTorBoxWebDownload(api, ["magnet:?xt=urn:btih:abc"]),
      new Error(DownloadError.TorBoxLinkUnavailable)
    );
  });
});
