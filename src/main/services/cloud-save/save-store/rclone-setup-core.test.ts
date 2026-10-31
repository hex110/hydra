import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findChecksum,
  isValidBucketName,
  parseRcloneVersion,
  r2RemoteArguments,
  rcloneArch,
} from "./rclone-setup-core.ts";

describe("rclone setup", () => {
  it("reads the version and the checksum of the download", () => {
    assert.equal(parseRcloneVersion("rclone v1.75.2\n"), "v1.75.2");
    const sums =
      "349ac8fba6ff65d6247043f1750cdcb518ec5d500ef91463a10d37c0ccdf3702  rclone-v1.75.2-linux-amd64.zip\n" +
      "0000000000000000000000000000000000000000000000000000000000000000  rclone-v1.75.2-linux-arm64.zip\n";
    assert.equal(
      findChecksum(sums, "rclone-v1.75.2-linux-amd64.zip"),
      "349ac8fba6ff65d6247043f1750cdcb518ec5d500ef91463a10d37c0ccdf3702"
    );
    assert.equal(findChecksum(sums, "missing.zip"), null);
    assert.equal(rcloneArch("x64"), "amd64");
    assert.equal(rcloneArch("mips"), null);
  });

  it("builds an R2 remote and refuses a malformed account id", () => {
    const args = r2RemoteArguments({
      accountId: "0123456789ABCDEF0123456789abcdef",
      accessKeyId: " key ",
      secretAccessKey: "secret",
    });
    assert.ok(
      args.includes(
        "endpoint=https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com"
      )
    );
    assert.ok(args.includes("access_key_id=key"));
    assert.ok(args.includes("no_check_bucket=true"));
    assert.throws(
      () =>
        r2RemoteArguments({
          accountId: "not-an-id",
          accessKeyId: "a",
          secretAccessKey: "b",
        }),
      /r2_account_id/
    );
  });

  it("checks bucket names", () => {
    assert.equal(isValidBucketName("hydra-saves"), true);
    assert.equal(isValidBucketName("Hydra_Saves"), false);
  });
});
