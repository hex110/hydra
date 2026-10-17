import { describe, it } from "node:test";
import assert from "node:assert";
import {
  buildSourceIndex,
  mergeLocalRepacks,
  parseSourceDocument,
  sourceMatchKey,
  toLocalRepack,
} from "./local-source-matching.js";

describe("parseSourceDocument", () => {
  it("keeps valid downloads and drops malformed ones", () => {
    const parsed = parseSourceDocument({
      name: "AnkerGames",
      downloads: [
        {
          title: "Going Medieval – V 1.2.12 / Build 25933619",
          uris: ["https://datanodes.to/a/Going-Medieval.zip", 3],
          uploadDate: "2026-10-16T16:13:00Z",
          fileSize: "696.3 MB",
        },
        { title: "No links", uris: [] },
        { uris: ["magnet:?xt=urn:btih:abc"] },
        null,
      ],
    });

    assert.strictEqual(parsed?.name, "AnkerGames");
    assert.deepStrictEqual(parsed?.downloads, [
      {
        title: "Going Medieval – V 1.2.12 / Build 25933619",
        uris: ["https://datanodes.to/a/Going-Medieval.zip"],
        uploadDate: "2026-10-16T16:13:00Z",
        fileSize: "696.3 MB",
      },
    ]);
  });

  it("rejects documents without a downloads list", () => {
    assert.strictEqual(parseSourceDocument({ name: "x" }), null);
    assert.strictEqual(parseSourceDocument("<!DOCTYPE html>"), null);
  });
});

describe("source matching", () => {
  const downloads = [
    "Dragon's Dogma 2 – V 4.0.0.0 / Build 25290080",
    "Dragon's Dogma 2 Deluxe Edition [FitGirl Repack]",
    "Resident Evil 3 – Build 24468913",
    "Hades II (v1.0) [DODI Repack]",
  ].map((title) => ({
    title,
    uris: [`magnet:?xt=urn:btih:${title.length}`],
    uploadDate: null,
    fileSize: null,
  }));
  const index = buildSourceIndex(downloads);

  it("matches catalogue titles to release names", () => {
    assert.strictEqual(
      index.get(sourceMatchKey("Dragon's Dogma 2"))?.length,
      2
    );
    assert.strictEqual(index.get(sourceMatchKey("Resident Evil 3"))?.length, 1);
    assert.strictEqual(index.get(sourceMatchKey("Hades II"))?.length, 1);
    assert.strictEqual(
      sourceMatchKey("Lost Soul Aside™"),
      sourceMatchKey("Lost Soul Aside – V 1.103 / Build 22971784")
    );
  });

  it("keeps sequels and remakes apart", () => {
    assert.strictEqual(index.get(sourceMatchKey("Hades")), undefined);
    assert.strictEqual(index.get(sourceMatchKey("Resident Evil")), undefined);
  });
});

describe("mergeLocalRepacks", () => {
  const source = { id: "src1", name: "Source", createdAt: "2026-01-01" };
  const make = (title: string, uris: string[]) =>
    toLocalRepack({ title, uris, uploadDate: null, fileSize: null }, source);

  it("adds local repacks whose links the server did not return", () => {
    const server = [make("A", ["magnet:a", "https://x/a"])];
    const local = [
      make("A again", ["https://x/a"]),
      make("B", ["magnet:b"]),
      make("B twice", ["magnet:b"]),
    ];
    assert.deepStrictEqual(
      mergeLocalRepacks(server, local).map((repack) => repack.title),
      ["A", "B"]
    );
  });

  it("refreshes stale server entries that share a link with a newer local one", () => {
    const server = [
      {
        ...make("Going Medieval – V 1.1.13", ["https://x/gm.zip"]),
        id: "server-id",
        uploadDate: "2026-07-31T13:33:00Z",
        fileSize: "706.6 MB",
      },
    ];
    const local = [
      {
        ...make("Going Medieval – V 1.2.12", ["https://x/gm.zip"]),
        uploadDate: "2026-10-16T16:13:00Z",
        fileSize: "696.3 MB",
      },
    ];

    const [merged] = mergeLocalRepacks(server, local);
    assert.strictEqual(merged.id, "server-id");
    assert.strictEqual(merged.title, "Going Medieval – V 1.2.12");
    assert.strictEqual(merged.fileSize, "696.3 MB");

    const [unchanged] = mergeLocalRepacks(local, server);
    assert.strictEqual(unchanged.title, "Going Medieval – V 1.2.12");
  });

  it("gives local repacks stable ids per source and links", () => {
    assert.strictEqual(make("A", ["magnet:a"]).id, make("A2", ["magnet:a"]).id);
    assert.notStrictEqual(
      make("A", ["magnet:a"]).id,
      make("A", ["magnet:b"]).id
    );
    assert.ok(make("A", ["magnet:a"]).id.startsWith("local-src1-"));
  });
});
