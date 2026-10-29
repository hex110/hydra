import { describe, it } from "node:test";
import assert from "node:assert";
import { appendDirectoryToPath } from "./bundled-commands.js";

describe("appendDirectoryToPath", () => {
  it("adds the directory after the existing entries, so theirs win", () => {
    assert.strictEqual(
      appendDirectoryToPath("/usr/bin:/home/me/.local/bin", "/opt/hydra/bin"),
      "/usr/bin:/home/me/.local/bin:/opt/hydra/bin"
    );
  });

  it("does not add it twice", () => {
    assert.strictEqual(
      appendDirectoryToPath("/usr/bin:/opt/hydra/bin", "/opt/hydra/bin"),
      "/usr/bin:/opt/hydra/bin"
    );
  });

  it("works without a PATH", () => {
    assert.strictEqual(
      appendDirectoryToPath(undefined, "/opt/hydra/bin"),
      "/opt/hydra/bin"
    );
    assert.strictEqual(
      appendDirectoryToPath("", "/opt/hydra/bin"),
      "/opt/hydra/bin"
    );
  });
});
