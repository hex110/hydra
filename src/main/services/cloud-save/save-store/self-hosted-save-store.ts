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

const ROOT = "hydra-plus-saves/v1";
// Older versions stay as history; their blobs are kept too.
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

interface StoredHead {
  version: number;
  createdAt: string;
}

interface PendingSnapshot {
  request: PrepareSnapshotRequest;
  uploads: Pick<SnapshotFile, "hash" | "sizeBytes">[];
  createdAt: number;
}

const encode = (value: string) => Buffer.from(value).toString("base64url");

/**
 * Snapshot ids carry the game, so a restore needs no extra lookup. Only
 * letters, digits and dashes: restore uses the id as a folder name.
 */
const snapshotIdFor = (shop: GameShop, objectId: string) =>
  `hp1-${shop}-${Buffer.from(objectId).toString("hex")}`;

const parseSnapshotId = (snapshotId: string) => {
  const [prefix, shop, objectId] = snapshotId.split("-");
  if (prefix !== "hp1" || !shop || !objectId) {
    throw new Error(`Unknown self-hosted snapshot id ${snapshotId}`);
  }
  return {
    shop: shop as GameShop,
    objectId: Buffer.from(objectId, "hex").toString(),
  };
};

const gameDir = (shop: GameShop, objectId: string) =>
  `${ROOT}/games/${shop}/${encode(objectId)}`;

export const blobPath = (hash: string, sizeBytes: number) =>
  `${ROOT}/blobs/${hash.slice(0, 2)}/${hash}-${sizeBytes}`;

const blobKey = (file: Pick<SnapshotFile, "hash" | "sizeBytes">) =>
  `${file.hash}:${file.sizeBytes}`;

const parseJson = <T>(text: string | null): T | null =>
  text === null ? null : (JSON.parse(text) as T);

/**
 * Hydra Cloud's snapshot model on storage the user owns: one active snapshot
 * per game whose version number guards against two devices overwriting each
 * other, and files stored once by content hash.
 */
export class SelfHostedSaveStore {
  private readonly pending = new Map<string, PendingSnapshot>();

  constructor(private readonly backend: SaveStoreBackend) {}

  private async readHead(shop: GameShop, objectId: string) {
    return parseJson<StoredHead>(
      await this.backend.readText(`${gameDir(shop, objectId)}/head.json`)
    );
  }

  private async readVersion(shop: GameShop, objectId: string, version: number) {
    return parseJson<StoredSnapshot>(
      await this.backend.readText(
        `${gameDir(shop, objectId)}/versions/${version}.json`
      )
    );
  }

  async listSnapshots(
    objectId: string,
    shop: GameShop
  ): Promise<RemoteSnapshotSummary[]> {
    const head = await this.readHead(shop, objectId);
    if (!head) return [];

    const stored = await this.readVersion(shop, objectId, head.version);
    if (!stored) return [];

    return [
      {
        id: stored.snapshot.id,
        version: stored.snapshot.version,
        createdAt: head.createdAt,
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

    const dir = gameDir(request.shop, request.objectId);
    const written = await this.backend.writeText(
      `${dir}/versions/${version}.json`,
      JSON.stringify(stored),
      { exclusive: true }
    );
    if (!written || (head?.version ?? 0) !== request.baseVersion) {
      throw new SaveStoreConflictError();
    }

    await this.backend.writeText(
      `${dir}/head.json`,
      JSON.stringify({
        version,
        createdAt: head?.createdAt ?? now,
      } satisfies StoredHead)
    );
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
