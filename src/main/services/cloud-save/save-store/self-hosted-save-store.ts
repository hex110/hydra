import { randomUUID } from "node:crypto";

import type {
  CommitSnapshotResponse,
  GameShop,
  PrepareSnapshotFile,
  PrepareSnapshotRequest,
  PrepareSnapshotResponse,
  RemoteSnapshotSummary,
  RestoreManifestResponse,
  SnapshotFile,
} from "@types";

import type { SaveStoreBackend } from "./backends";
import {
  blobPath,
  devicePath,
  gameDir,
  libraryPath,
  parseSnapshotId,
  parseVersionFileName,
  pickVersionFile,
  ROOT,
  snapshotIdFor,
  versionFileName,
} from "./layout.js";

export { blobPath } from "./layout.js";

// Older versions stay as history until a cleanup prunes them.
const PENDING_TTL_MS = 60 * 60_000;

/** Raised when another device committed the version this one meant to write. */
export class SaveStoreConflictError extends Error {
  constructor() {
    super("cloud-save-version-conflict");
  }
}

interface StoredSnapshot {
  snapshot: RestoreManifestResponse["snapshot"];
  createdAt: string;
  updatedAt: string;
  hostname: string | null;
  platform: string;
  aggregateHash: string;
  fileCount: number;
  totalSizeBytes: number;
  customPathRawPaths: string[];
  variants: RestoreManifestResponse["variants"];
  files: SnapshotFile[];
}

interface PendingSnapshot {
  request: PrepareSnapshotRequest;
  uploads: Pick<SnapshotFile, "hash" | "sizeBytes">[];
  createdAt: number;
}

const blobKey = (file: Pick<SnapshotFile, "hash" | "sizeBytes">) =>
  `${file.hash}:${file.sizeBytes}`;

const parseJson = <T>(text: string | null): T | null =>
  text === null ? null : (JSON.parse(text) as T);

/**
 * Hydra Cloud's snapshot model on storage the user owns: one active snapshot
 * per game whose version number guards against two devices overwriting each
 * other, and files stored once by content hash.
 *
 * Remotes have no atomic "create only if absent", so a commit never relies on
 * one: each device writes its own file for a version, then lists the folder.
 * Whoever sees another device's file for the same version backs out, and since
 * a write always precedes its own listing, two devices cannot both succeed.
 */
export class SelfHostedSaveStore {
  private readonly pending = new Map<string, PendingSnapshot>();

  constructor(
    readonly backend: SaveStoreBackend,
    readonly deviceId: string
  ) {}

  private versionsDir(shop: GameShop, objectId: string) {
    return `${gameDir(shop, objectId)}/versions`;
  }

  /** Version number to the names of the files written for it. */
  private async listVersions(shop: GameShop, objectId: string) {
    const versions = new Map<number, string[]>();
    for (const entry of await this.backend.list(
      this.versionsDir(shop, objectId)
    )) {
      const parsed = parseVersionFileName(entry.path);
      if (!parsed) continue;
      versions.set(parsed.version, [
        ...(versions.get(parsed.version) ?? []),
        entry.path,
      ]);
    }
    return versions;
  }

  private async readHead(shop: GameShop, objectId: string) {
    const versions = await this.listVersions(shop, objectId);
    const version = Math.max(0, ...versions.keys());
    return version === 0 ? null : { version, names: versions.get(version)! };
  }

  private async readVersion(shop: GameShop, objectId: string, version: number) {
    const names = (await this.listVersions(shop, objectId)).get(version);
    if (!names?.length) return null;
    return parseJson<StoredSnapshot>(
      await this.backend.readText(
        `${this.versionsDir(shop, objectId)}/${pickVersionFile(names)}`
      )
    );
  }

  async listSnapshots(
    objectId: string,
    shop: GameShop
  ): Promise<RemoteSnapshotSummary[]> {
    const head = await this.readHead(shop, objectId);
    if (!head) return [];

    const stored = parseJson<StoredSnapshot>(
      await this.backend.readText(
        `${this.versionsDir(shop, objectId)}/${pickVersionFile(head.names)}`
      )
    );
    if (!stored) return [];

    return [
      {
        id: stored.snapshot.id,
        version: stored.snapshot.version,
        createdAt: stored.createdAt,
        updatedAt: stored.updatedAt,
        fileCount: stored.fileCount,
        totalSizeBytes: stored.totalSizeBytes,
        aggregateHash: stored.aggregateHash,
      },
    ];
  }

  async prepare(
    request: PrepareSnapshotRequest
  ): Promise<PrepareSnapshotResponse> {
    const head = await this.readHead(request.shop, request.objectId);
    if ((head?.version ?? 0) !== request.baseVersion) {
      throw new SaveStoreConflictError();
    }

    const present = new Map<string, boolean>();
    for (const file of request.files) {
      const key = blobKey(file);
      if (!present.has(key)) {
        present.set(
          key,
          await this.backend.exists(blobPath(file.hash, file.sizeBytes))
        );
      }
    }

    const files: PrepareSnapshotFile[] = request.files.map((file) => {
      const identity = {
        variantId: file.variantId,
        rawPath: file.rawPath,
        relativePath: file.relativePath,
      };
      if (present.get(blobKey(file))) return { ...identity, status: "skip" };
      return {
        ...identity,
        status: "upload",
        uploadUrl: `hydra-plus-store:${blobPath(file.hash, file.sizeBytes)}`,
        requiredHeaders: {
          "Content-Length": String(file.sizeBytes),
          "x-amz-checksum-sha256": Buffer.from(file.hash, "hex").toString(
            "base64"
          ),
        },
      };
    });

    const now = Date.now();
    for (const [id, entry] of this.pending) {
      if (now - entry.createdAt > PENDING_TTL_MS) this.pending.delete(id);
    }

    const pendingSnapshotId = randomUUID();
    this.pending.set(pendingSnapshotId, {
      request,
      uploads: request.files.filter((file) => !present.get(blobKey(file))),
      createdAt: now,
    });

    return { pendingSnapshotId, snapshotHash: request.snapshotHash, files };
  }

  async putBlob(localPath: string, hash: string, sizeBytes: number) {
    const target = blobPath(hash, sizeBytes);
    if (await this.backend.exists(target)) return;
    await this.backend.putFile(localPath, target);
  }

  async commit(pendingSnapshotId: string): Promise<CommitSnapshotResponse> {
    const pending = this.pending.get(pendingSnapshotId);
    // Makes the caller prepare again, as with an expired Hydra Cloud upload.
    if (!pending) throw new Error("cloud_save_upload_url_expired");

    for (const file of pending.uploads) {
      if (!(await this.backend.exists(blobPath(file.hash, file.sizeBytes)))) {
        this.pending.delete(pendingSnapshotId);
        throw new Error("cloud_save_upload_url_expired");
      }
    }

    const { request } = pending;
    const head = await this.readHead(request.shop, request.objectId);
    if ((head?.version ?? 0) !== request.baseVersion) {
      throw new SaveStoreConflictError();
    }

    const version = request.baseVersion + 1;
    const now = new Date().toISOString();
    const stored: StoredSnapshot = {
      snapshot: {
        id: snapshotIdFor(request.shop, request.objectId),
        version,
        shop: request.shop,
        objectId: request.objectId,
      },
      createdAt: now,
      updatedAt: now,
      hostname: request.hostname ?? null,
      platform: request.platform,
      aggregateHash: request.snapshotHash,
      fileCount: request.files.length,
      totalSizeBytes: request.files.reduce(
        (total, file) => total + file.sizeBytes,
        0
      ),
      customPathRawPaths: request.customPathRawPaths,
      variants: request.variants,
      files: request.files,
    };

    const dir = this.versionsDir(request.shop, request.objectId);
    const ownName = versionFileName(version, this.deviceId);
    await this.backend.writeText(`${dir}/${ownName}`, JSON.stringify(stored));

    const rivals = (
      (await this.listVersions(request.shop, request.objectId)).get(version) ??
      []
    ).filter((name) => name !== ownName);
    if (rivals.length > 0) {
      await this.backend.removeFile(`${dir}/${ownName}`);
      throw new SaveStoreConflictError();
    }

    this.pending.delete(pendingSnapshotId);

    return {
      snapshotId: stored.snapshot.id,
      version,
      fileCount: stored.fileCount,
      totalSizeBytes: stored.totalSizeBytes,
      aggregateHash: stored.aggregateHash,
    };
  }

  async getRestoreManifest(
    snapshotId: string,
    version: number
  ): Promise<RestoreManifestResponse> {
    const { shop, objectId } = parseSnapshotId(snapshotId);
    const stored = await this.readVersion(shop, objectId, version);
    if (!stored) throw new Error("Self-hosted snapshot version not found");

    return {
      snapshot: stored.snapshot,
      customPathRawPaths: stored.customPathRawPaths,
      variants: stored.variants,
      files: stored.files,
    };
  }

  async downloadBlob(
    file: Pick<SnapshotFile, "hash" | "sizeBytes">,
    localPath: string
  ) {
    await this.backend.getFile(blobPath(file.hash, file.sizeBytes), localPath);
  }

  async deleteGame(objectId: string, shop: GameShop) {
    await this.backend.removeDir(gameDir(shop, objectId));
  }

  /** Each device writes only its own file, so syncing state needs no locking. */
  async writeDeviceState(state: unknown) {
    await this.backend.writeText(
      devicePath(this.deviceId),
      JSON.stringify(state)
    );
  }

  /** Every device's state file, this one included. */
  async readDeviceStates<T>(): Promise<T[]> {
    const names = (await this.backend.list(`${ROOT}/devices`)).map(
      (entry) => entry.path
    );
    const texts = await this.backend.readTexts(
      names.map((name) => `${ROOT}/devices/${name}`)
    );
    const states: T[] = [];
    for (const text of texts.values()) {
      try {
        states.push(JSON.parse(text) as T);
      } catch {
        // A half-written or foreign file: skip it, the next sync rewrites its own.
      }
    }
    return states;
  }

  /** This device's library list; other devices import from it on request. */
  async writeLibrary(library: unknown) {
    await this.backend.writeText(
      libraryPath(this.deviceId),
      JSON.stringify(library)
    );
  }

  /** Every device's library list, this one included. */
  async readLibraries<T>(): Promise<T[]> {
    const names = (await this.backend.list(`${ROOT}/libraries`)).map(
      (entry) => entry.path
    );
    const texts = await this.backend.readTexts(
      names.map((name) => `${ROOT}/libraries/${name}`)
    );
    const libraries: T[] = [];
    for (const text of texts.values()) {
      try {
        libraries.push(JSON.parse(text) as T);
      } catch {
        // Half-written: the owning device rewrites it on its next sync.
      }
    }
    return libraries;
  }

  /** Writes, reads back and removes a probe file. */
  async test() {
    const probe = `${ROOT}/probe/${randomUUID()}.txt`;
    const value = `hydra-plus ${new Date().toISOString()}`;
    await this.backend.writeText(probe, value);
    const read = await this.backend.readText(probe);
    await this.backend.removeDir(`${ROOT}/probe`);
    if (read?.trim() !== value) throw new Error("save-store-probe-mismatch");
  }
}
