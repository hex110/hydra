import { describe, it } from "node:test";
import assert from "node:assert";
import type { SaveImportFilePreview, SaveImportPreview } from "@types";
import {
  countImportableFiles,
  pickBestPreview,
  toFileAction,
} from "./save-import-plan.ts";

const SOURCE_TIME = "2026-05-01T10:00:00.000Z";

const file = (
  action: SaveImportFilePreview["action"]
): SaveImportFilePreview => ({
  rawPath: "<home>/AppData",
  relativePath: `${action}.sav`,
  sizeBytes: 1,
  lastModifiedAt: SOURCE_TIME,
  action,
  targetPath: `/prefix/${action}.sav`,
});

const preview = (
  sourceId: string,
  files: SaveImportFilePreview[],
  achievements: number,
  newestFileAt: string | null
): SaveImportPreview => ({
  sourceId,
  sourceLabel: sourceId,
  files,
  unmappedFiles: 0,
  achievements,
  newestFileAt,
});

describe("toFileAction", () => {
  it("keeps identical and new files as they are", () => {
    assert.strictEqual(
      toFileAction({ action: "skip-identical", lastModifiedAt: SOURCE_TIME }),
      "identical"
    );
    assert.strictEqual(
      toFileAction({ action: "create", lastModifiedAt: SOURCE_TIME }),
      "create"
    );
  });

  it("replaces files the game has an older copy of", () => {
    assert.strictEqual(
      toFileAction({
        action: "replace",
        lastModifiedAt: SOURCE_TIME,
        observedLastModifiedAt: "2026-04-01T10:00:00.000Z",
      }),
      "replace"
    );
  });

  it("keeps files that are newer in the game", () => {
    assert.strictEqual(
      toFileAction({
        action: "replace",
        lastModifiedAt: SOURCE_TIME,
        observedLastModifiedAt: "2026-06-01T10:00:00.000Z",
      }),
      "keep-newer"
    );
  });
});

describe("pickBestPreview", () => {
  it("ignores sources with nothing left to import", () => {
    const done = preview(
      "done",
      [file("identical"), file("keep-newer")],
      0,
      "2026-09-01T00:00:00.000Z"
    );
    assert.strictEqual(pickBestPreview([done]), null);
    assert.strictEqual(countImportableFiles(done), 0);
  });

  it("prefers the source whose saves were written last", () => {
    const older = preview("older", [file("create")], 0, SOURCE_TIME);
    const newer = preview(
      "newer",
      [file("replace")],
      0,
      "2026-08-01T00:00:00.000Z"
    );
    assert.strictEqual(pickBestPreview([older, newer])?.sourceId, "newer");
  });

  it("imports achievements even without save files", () => {
    const achievementsOnly = preview("achievements", [], 3, null);
    assert.strictEqual(
      pickBestPreview([achievementsOnly])?.sourceId,
      "achievements"
    );
  });
});
