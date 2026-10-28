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
import { cleanUpSaveStore, scanSaveStore } from "./store-maintenance.ts";

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
      const store = new SelfHostedSaveStore(makeBackend(root), "device-a");
      // A second device on the same storage.
      const other = new SelfHostedSaveStore(makeBackend(root), "device-b");
      return { root, work, store, other };
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
      const { work, store, other } = setup();
      const save = makeFile(work, "slot1.sav", "a");

      const deviceA = await upload(store, [save], 0);
      const deviceB = await upload(other, [save], 0);
      await store.commit(deviceA.pendingSnapshotId);
      await assert.rejects(
        other.commit(deviceB.pendingSnapshotId),
        SaveStoreConflictError
      );
      await assert.rejects(
        other.prepare(request([save.file], 0)),
        SaveStoreConflictError
      );
      // The loser left nothing behind; the winner's version is the head.
      const [head] = await other.listSnapshots("620", "steam");
      assert.equal(head.version, 1);
    });

    it("lets only one of two devices commit the same version at once", async () => {
      const { work, store, other } = setup();
      const save = makeFile(work, "slot1.sav", "a");

      const deviceA = await upload(store, [save], 0);
      const deviceB = await upload(other, [save], 0);
      const results = await Promise.allSettled([
        store.commit(deviceA.pendingSnapshotId),
        other.commit(deviceB.pendingSnapshotId),
      ]);

      const won = results.filter((result) => result.status === "fulfilled");
      assert.ok(won.length <= 1, "both devices claimed version 1");
      // When both see each other's file, both back out: nothing is lost, and
      // the next sync reports a conflict to resolve.
      const heads = await store.listSnapshots("620", "steam");
      assert.equal(heads.length, won.length);
      for (const result of results) {
        if (result.status === "rejected") {
          assert.ok(result.reason instanceof SaveStoreConflictError);
        }
      }
    });

    it("reads versions written before devices got their own files", async () => {
      const { root, work, store } = setup();
      const save = makeFile(work, "slot1.sav", "old");
      const prepared = await upload(store, [save], 0);
      const committed = await store.commit(prepared.pendingSnapshotId);

      // Rename to the old `<version>.json` layout.
      const dir = path.join(
        root,
        "hydra-plus-saves/v1/games/steam",
        fs.readdirSync(path.join(root, "hydra-plus-saves/v1/games/steam"))[0],
        "versions"
      );
      fs.renameSync(
        path.join(dir, "1.device-a.json"),
        path.join(dir, "1.json")
      );

      const [head] = await store.listSnapshots("620", "steam");
      assert.equal(head.version, 1);
      const manifest = await store.getRestoreManifest(committed.snapshotId, 1);
      assert.equal(manifest.files.length, 1);
    });

    it("keeps each device's state in its own file", async () => {
      const { store, other } = setup();
      await store.writeDeviceState({ deviceId: "device-a", games: {} });
      await other.writeDeviceState({ deviceId: "device-b", games: {} });
      await store.writeDeviceState({ deviceId: "device-a", games: { x: 1 } });

      const states = await other.readDeviceStates<{ deviceId: string }>();
      assert.deepEqual(states.map((state) => state.deviceId).sort(), [
        "device-a",
        "device-b",
      ]);
    });

    it("prunes old versions and unused files but never the newest version", async () => {
      const { work, store } = setup();
      const backend = store.backend;
      const first = makeFile(work, "slot1.sav", "version one");
      const second = makeFile(work, "slot1.sav", "version two");
      const third = makeFile(work, "slot1.sav", "version three");

      await store.commit((await upload(store, [first], 0)).pendingSnapshotId);
      await store.commit((await upload(store, [second], 1)).pendingSnapshotId);
      await store.commit((await upload(store, [third], 2)).pendingSnapshotId);

      const usage = await scanSaveStore(backend, {
        keepVersions: 1,
        blobGraceMs: 0,
        now: Date.now() + 60_000,
      });
      assert.equal(usage.games, 1);
      assert.equal(usage.versions, 3);
      assert.equal(usage.reclaimableVersions, 2);
      assert.equal(usage.reclaimableBlobs, 2);

      // New files are protected by the grace period.
      const guarded = await scanSaveStore(backend, {
        keepVersions: 1,
        now: Date.now(),
      });
      assert.equal(guarded.reclaimableBlobs, 0);

      const result = await cleanUpSaveStore(backend, {
        keepVersions: 1,
        blobGraceMs: 0,
        now: Date.now() + 60_000,
      });
      assert.equal(result.removedVersions, 2);
      assert.equal(result.removedBlobs, 2);

      const [head] = await store.listSnapshots("620", "steam");
      assert.equal(head.version, 3);
      const restored = path.join(work, "restored.sav");
      const manifest = await store.getRestoreManifest(head.id, 3);
      await store.downloadBlob(manifest.files[0], restored);
      assert.equal(fs.readFileSync(restored, "utf8"), "version three");

      const after = await scanSaveStore(backend, {
        keepVersions: 1,
        blobGraceMs: 0,
        now: Date.now() + 60_000,
      });
      assert.equal(after.reclaimableBytes, 0);
    });

    it("keeps every version when asked to", async () => {
      const { work, store } = setup();
      const first = makeFile(work, "slot1.sav", "one");
      const second = makeFile(work, "slot1.sav", "two");
      await store.commit((await upload(store, [first], 0)).pendingSnapshotId);
      await store.commit((await upload(store, [second], 1)).pendingSnapshotId);

      const usage = await scanSaveStore(store.backend, {
        keepVersions: 0,
        blobGraceMs: 0,
        now: Date.now() + 60_000,
      });
      assert.equal(usage.reclaimableVersions, 0);
      assert.equal(usage.reclaimableBlobs, 0);
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
