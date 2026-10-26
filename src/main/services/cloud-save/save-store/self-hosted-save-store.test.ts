import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import type { PrepareSnapshotRequest, SnapshotFile } from "@types";

import {
  FolderBackend,
  RcloneBackend,
  isRcloneAvailable,
  type SaveStoreBackend,
} from "./backends.ts";
import {
  SaveStoreConflictError,
  SelfHostedSaveStore,
} from "./self-hosted-save-store.ts";

const VARIANT = "a".repeat(64);

const makeFile = (dir: string, name: string, content: string) => {
  const absolutePath = path.join(dir, name);
  fs.writeFileSync(absolutePath, content);
  const file: SnapshotFile = {
    variantId: VARIANT,
    rawPath: `<home>/saves/${name}`,
    relativePath: name,
    hash: createHash("sha256").update(content).digest("hex"),
    sizeBytes: Buffer.byteLength(content),
    lastModifiedAt: "2026-10-26T12:00:00.000Z",
  };
  return { file, absolutePath };
};

const request = (
  files: SnapshotFile[],
  baseVersion: number
): PrepareSnapshotRequest => ({
  shop: "steam",
  objectId: "620",
  platform: "linux",
  hostname: "test-host",
  snapshotHash: "b".repeat(64),
  baseVersion,
  customPathRawPaths: [],
  variants: [{ variantId: VARIANT, kind: "default" }],
  files,
});

const upload = async (
  store: SelfHostedSaveStore,
  files: { file: SnapshotFile; absolutePath: string }[],
  baseVersion: number
) => {
  const prepared = await store.prepare(
    request(
      files.map((item) => item.file),
      baseVersion
    )
  );
  for (const [index, entry] of prepared.files.entries()) {
    if (entry.status === "upload") {
      const { file, absolutePath } = files[index];
      await store.putBlob(absolutePath, file.hash, file.sizeBytes);
    }
  }
  return prepared;
};

const suite = (name: string, makeBackend: (root: string) => SaveStoreBackend) =>
  describe(`self-hosted save store (${name})`, () => {
    const setup = () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-store-"));
      const work = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-saves-"));
      return { root, work, store: new SelfHostedSaveStore(makeBackend(root)) };
    };

    it("round-trips a snapshot and stores each file once", async () => {
      const { work, store } = setup();
      const save = makeFile(work, "slot1.sav", "progress");

      const first = await upload(store, [save], 0);
      assert.equal(first.files[0].status, "upload");
      const committed = await store.commit(first.pendingSnapshotId);
      assert.equal(committed.version, 1);
      assert.equal(committed.fileCount, 1);

      const [summary] = await store.listSnapshots("620", "steam");
      assert.equal(summary.id, committed.snapshotId);
      assert.equal(summary.version, 1);

      const manifest = await store.getRestoreManifest(summary.id, 1);
      assert.equal(manifest.snapshot.objectId, "620");
      assert.deepEqual(manifest.files, [save.file]);

      const restored = path.join(work, "restored", "slot1.sav");
      await store.downloadBlob(save.file, restored);
      assert.equal(fs.readFileSync(restored, "utf8"), "progress");

      // Same content again: nothing to upload, the id stays.
      const second = await upload(store, [save], 1);
      assert.equal(second.files[0].status, "skip");
      const next = await store.commit(second.pendingSnapshotId);
      assert.equal(next.version, 2);
      assert.equal(next.snapshotId, committed.snapshotId);
    });

    it("refuses a version another device already wrote", async () => {
      const { work, store } = setup();
      const save = makeFile(work, "slot1.sav", "a");

      const deviceA = await upload(store, [save], 0);
      const deviceB = await upload(store, [save], 0);
      await store.commit(deviceA.pendingSnapshotId);
      await assert.rejects(
        store.commit(deviceB.pendingSnapshotId),
        SaveStoreConflictError
      );
      await assert.rejects(
        store.prepare(request([save.file], 0)),
        SaveStoreConflictError
      );
    });

    it("asks for a new prepare when the pending snapshot is unknown or incomplete", async () => {
      const { work, store } = setup();
      await assert.rejects(store.commit("missing"), /upload_url_expired/);

      const save = makeFile(work, "slot1.sav", "never uploaded");
      const prepared = await store.prepare(request([save.file], 0));
      await assert.rejects(
        store.commit(prepared.pendingSnapshotId),
        /upload_url_expired/
      );
    });

    it("deletes a game's snapshots and passes its own probe", async () => {
      const { work, store } = setup();
      const save = makeFile(work, "slot1.sav", "x");
      await store.commit((await upload(store, [save], 0)).pendingSnapshotId);

      await store.deleteGame("620", "steam");
      assert.deepEqual(await store.listSnapshots("620", "steam"), []);
      await store.test();
    });

    it("uses a snapshot id restore can use as a folder name", async () => {
      const { work, store } = setup();
      const save = makeFile(work, "slot1.sav", "x");
      const prepared = await store.prepare({
        ...request([save.file], 0),
        shop: "custom",
        objectId: "3f2c/odd id",
      });
      await store.putBlob(
        save.absolutePath,
        save.file.hash,
        save.file.sizeBytes
      );
      const committed = await store.commit(prepared.pendingSnapshotId);
      assert.match(committed.snapshotId, /^[A-Za-z0-9_-]+$/);
      const manifest = await store.getRestoreManifest(committed.snapshotId, 1);
      assert.equal(manifest.snapshot.objectId, "3f2c/odd id");
    });
  });

suite("folder", (root) => new FolderBackend(root));

if (await isRcloneAvailable()) {
  suite("rclone", (root) => new RcloneBackend(`:local:${root}`));
}
