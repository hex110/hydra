import { describe, it } from "node:test";
import assert from "node:assert";
import { guessGameExecutable } from "./guess-game-executable.ts";

const MB = 1024 * 1024;

describe("guessGameExecutable", () => {
  it("returns null when there is no playable executable", () => {
    assert.strictEqual(
      guessGameExecutable(
        [
          { relativePath: "unins000.exe", sizeInBytes: 3 * MB },
          { relativePath: "_CommonRedist/vcredist_x64.exe", sizeInBytes: MB },
          { relativePath: "readme.txt", sizeInBytes: 1 },
        ],
        "Some Game"
      ),
      null
    );
  });

  it("prefers the executable named after the game", () => {
    assert.strictEqual(
      guessGameExecutable(
        [
          { relativePath: "HollowKnight.exe", sizeInBytes: 600 * 1024 },
          { relativePath: "UnityCrashHandler64.exe", sizeInBytes: 1.5 * MB },
          { relativePath: "Tools/ModManager.exe", sizeInBytes: 10 * MB },
        ],
        "Hollow Knight"
      ),
      "HollowKnight.exe"
    );
  });

  it("prefers a root bootstrap over a deep shipping binary", () => {
    assert.strictEqual(
      guessGameExecutable(
        [
          { relativePath: "Stray.exe", sizeInBytes: 300 * 1024 },
          {
            relativePath: "Hk_project/Binaries/Win64/Stray-Win64-Shipping.exe",
            sizeInBytes: 90 * MB,
          },
          {
            relativePath: "Engine/Binaries/Win64/CrashReportClient.exe",
            sizeInBytes: 20 * MB,
          },
        ],
        "Stray"
      ),
      "Stray.exe"
    );
  });

  it("falls back to the largest executable near the top", () => {
    assert.strictEqual(
      guessGameExecutable(
        [
          { relativePath: "bin/x64/game.exe", sizeInBytes: 80 * MB },
          { relativePath: "launcher.exe", sizeInBytes: 2 * MB },
          { relativePath: "setup.exe", sizeInBytes: 5 * MB },
        ],
        "Totally Different Name"
      ),
      "bin/x64/game.exe"
    );
  });
});
