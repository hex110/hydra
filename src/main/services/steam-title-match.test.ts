import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pickSteamTitleMatch } from "./steam-title-match.js";

const items = (...names: string[]) =>
  names.map((name, index) => ({ id: index + 1, name }));

describe("Steam title matching", () => {
  it("ignores case, symbols and punctuation", () => {
    const found = pickSteamTitleMatch(
      "Marvel's Spider-Man Remastered",
      items("Marvel’s Spider-Man Remastered")
    );
    assert.equal(found?.id, 1);
    assert.equal(pickSteamTitleMatch("Hades II", items("HADES II™"))?.id, 1);
  });

  it("never takes a sequel, DLC or soundtrack for the game", () => {
    const search = items(
      "ELDEN RING NIGHTREIGN",
      "ELDEN RING Shadow of the Erdtree",
      "ELDEN RING"
    );
    assert.equal(pickSteamTitleMatch("Elden Ring", search)?.id, 3);
    assert.equal(pickSteamTitleMatch("Elden Ring: Nightreign", search)?.id, 1);
    assert.equal(pickSteamTitleMatch("Elden Ring", search.slice(0, 2)), null);
    assert.equal(
      pickSteamTitleMatch("Hades II", items("Hades II Original Soundtrack")),
      null
    );
  });

  it("prefers the exact name over an edition suffix", () => {
    const search = items("Resident Evil 4 (2005)", "Resident Evil 4");
    assert.equal(pickSteamTitleMatch("Resident Evil 4", search)?.id, 2);
  });

  it("accepts a Remastered or edition suffix on either side", () => {
    assert.equal(
      pickSteamTitleMatch(
        "The Witcher 3: Wild Hunt",
        items("The Witcher 3: Wild Hunt — Remastered")
      )?.id,
      1
    );
    assert.equal(
      pickSteamTitleMatch(
        "Fallout 4: Game of the Year Edition",
        items("Fallout 4")
      )?.id,
      1
    );
  });

  it("keeps Steam's order among equal names and finds nothing for no match", () => {
    assert.equal(pickSteamTitleMatch("Doom", items("DOOM", "Doom"))?.id, 1);
    assert.equal(pickSteamTitleMatch("Bloodborne", items("DOOM")), null);
    assert.equal(pickSteamTitleMatch("™", items("DOOM")), null);
  });
});
