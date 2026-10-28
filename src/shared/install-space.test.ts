import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { estimateInstallSpace } from "./install-space.js";

describe("estimateInstallSpace", () => {
  it("only needs the download when nothing is extracted", () => {
    const estimate = estimateInstallSpace({
      downloadBytes: 10,
      extract: false,
      deleteArchive: false,
    });

    assert.deepEqual(estimate.download, { peakBytes: 10, remainingBytes: 10 });
    assert.equal(estimate.extraction, null);
    assert.equal(estimate.installer, null);
  });

  it("needs room for the archive and the unpacked game while extracting", () => {
    const { extraction } = estimateInstallSpace({
      downloadBytes: 10,
      extract: true,
      deleteArchive: true,
    });

    assert.equal(extraction?.peakBytes, 20);
    assert.equal(extraction?.remainingBytes, 10);
  });

  it("keeps the archive's size when it is not deleted", () => {
    const { extraction, installer } = estimateInstallSpace({
      downloadBytes: 10,
      extract: true,
      deleteArchive: false,
    });

    assert.equal(extraction?.remainingBytes, 20);
    assert.equal(installer?.peakBytes, 30);
    assert.equal(installer?.remainingBytes, 20);
  });

  it("frees the unpacked installer once the game is installed", () => {
    const { installer } = estimateInstallSpace({
      downloadBytes: 10,
      extract: true,
      deleteArchive: true,
    });

    assert.equal(installer?.peakBytes, 20);
    assert.equal(installer?.remainingBytes, 10);
  });
});
