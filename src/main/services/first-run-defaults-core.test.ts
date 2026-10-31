import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { firstRunDownloadDefaults } from "./first-run-defaults-core.ts";

const options = {
  hasDownloads: false,
  homePath: "/home/ari",
  downloadsPath: "/home/ari/Downloads",
};

describe("firstRunDownloadDefaults", () => {
  it("puts a fresh install's games in ~/Games and deletes archives", () => {
    assert.deepEqual(firstRunDownloadDefaults(null, options), {
      downloadsPath: "/home/ari/Games",
      deleteArchiveFilesAfterExtractionByDefault: true,
    });
  });

  it("keeps the Downloads folder for an install that already used it", () => {
    assert.deepEqual(
      firstRunDownloadDefaults(null, { ...options, hasDownloads: true }),
      { downloadsPath: "/home/ari/Downloads" }
    );
  });

  it("leaves a chosen folder and a chosen archive setting alone", () => {
    assert.equal(
      firstRunDownloadDefaults({ downloadsPath: "/mnt/Games" }, options),
      null
    );
    assert.equal(
      firstRunDownloadDefaults(
        { deleteArchiveFilesAfterExtractionByDefault: false },
        options
      )?.deleteArchiveFilesAfterExtractionByDefault,
      false
    );
  });
});
