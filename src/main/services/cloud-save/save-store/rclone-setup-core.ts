import type { R2Credentials } from "@types";

/** rclone's name for this CPU, as used in its download file names. */
export const rcloneArch = (arch: string): string | null =>
  ({ x64: "amd64", arm64: "arm64", ia32: "386" })[arch] ?? null;

/** "rclone v1.75.2" → "v1.75.2". */
export const parseRcloneVersion = (text: string): string | null =>
  /\b(v\d+\.\d+\.\d+)\b/.exec(text)?.[1] ?? null;

/** The SHA-256 a SHA256SUMS file lists for one file name. */
export const findChecksum = (sums: string, fileName: string): string | null => {
  for (const line of sums.split("\n")) {
    const [hash, name] = line.trim().split(/\s+/);
    if (name === fileName && /^[0-9a-f]{64}$/i.test(hash ?? ""))
      return hash.toLowerCase();
  }
  return null;
};

export const R2_REMOTE_NAME = "hydra-r2";

/**
 * Arguments for `rclone config create|update` that point a remote at
 * Cloudflare R2. `no_check_bucket` keeps rclone from trying to create the
 * bucket, which a token limited to one bucket may not do.
 */
export const r2RemoteArguments = (credentials: R2Credentials) => {
  const accountId = credentials.accountId.trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(accountId)) throw new Error("r2_account_id");
  if (!credentials.accessKeyId.trim() || !credentials.secretAccessKey.trim())
    throw new Error("r2_keys");
  return [
    "provider=Cloudflare",
    `access_key_id=${credentials.accessKeyId.trim()}`,
    `secret_access_key=${credentials.secretAccessKey.trim()}`,
    `endpoint=https://${accountId}.r2.cloudflarestorage.com`,
    "acl=private",
    "no_check_bucket=true",
  ];
};

/** A bucket name R2 accepts: 3-63 lowercase letters, digits and hyphens. */
export const isValidBucketName = (name: string) =>
  /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name);
