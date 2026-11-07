import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chooseGuessedInstall } from "./choose-guessed-install.ts";

const guess = (folderPath: string) => ({
  folderPath,
  executablePath: `${folderPath}/game.exe`,
});

describe("chooseGuessedInstall", () => {
  it("prefers the folder named like the game", () => {
    const chosen = chooseGuessedInstall(
      [guess("/c/GOG Games/SHEEPO"), guess("/c/GOG Games/Other Tool")],
      "Sheepo",
      true
    );

    assert.equal(chosen?.folderPath, "/c/GOG Games/SHEEPO");
  });

  it("matches on a shared word, ignoring filler words", () => {
    assert.equal(
      chooseGuessedInstall(
        [guess("C:\\Games\\The Mole"), guess("C:\\Games\\The Other")],
        "Mole Mania",
        false
      )?.folderPath,
      "C:\\Games\\The Mole"
    );
  });

  it("refuses when several folders look like the game", () => {
    assert.equal(
      chooseGuessedInstall(
        [guess("/c/Games/Sheepo"), guess("/c/Games/Sheepo 2")],
        "Sheepo",
        true
      ),
      null
    );
  });

  it("trusts a lone unnamed folder only if it was just changed", () => {
    const lone = [guess("/c/Games/XYZ")];

    assert.equal(
      chooseGuessedInstall(lone, "Sheepo", true)?.folderPath,
      "/c/Games/XYZ"
    );
    assert.equal(chooseGuessedInstall(lone, "Sheepo", false), null);
  });

  it("refuses several unnamed folders", () => {
    assert.equal(
      chooseGuessedInstall(
        [guess("/c/Games/A"), guess("/c/Games/B")],
        "Sheepo",
        true
      ),
      null
    );
  });
});
