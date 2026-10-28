import { describe, it } from "node:test";
import assert from "node:assert";
import type { Game } from "@types";

import { updateGameExecutablePath } from "./update-executable-path.ts";

const game = (overrides: Partial<Game> = {}) =>
  ({
    objectId: "1",
    shop: "custom",
    executablePath: null,
    ...overrides,
  }) as Game;

describe("updateGameExecutablePath", () => {
  it("stamps installedAt when a game gets its first executable", () => {
    const updated = updateGameExecutablePath(game(), "/games/a/a.exe");
    assert.ok(updated.installedAt instanceof Date);
  });

  it("keeps installedAt when the executable only moves", () => {
    const installedAt = new Date("2026-01-01");
    const updated = updateGameExecutablePath(
      game({ executablePath: "/games/a/a.exe", installedAt }),
      "/games/b/a.exe"
    );
    assert.equal(updated.installedAt, installedAt);
  });

  it("keeps installedAt when the executable is cleared", () => {
    const installedAt = new Date("2026-01-01");
    const updated = updateGameExecutablePath(
      game({ executablePath: "/games/a/a.exe", installedAt }),
      null
    );
    assert.equal(updated.installedAt, installedAt);
  });
});
