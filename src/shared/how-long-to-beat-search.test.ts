import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatHowLongToBeatSeconds,
  howLongToBeatCategoriesFromEntry,
  pickHowLongToBeatEntry,
} from "./how-long-to-beat-search.js";
import { parseHowLongToBeat } from "./library-metadata.js";

describe("formatHowLongToBeatSeconds", () => {
  it("words times the way the Hydra API does", () => {
    assert.equal(formatHowLongToBeatSeconds(43983), "12 Hours");
    assert.equal(formatHowLongToBeatSeconds(69718), "19½ Hours");
    assert.equal(formatHowLongToBeatSeconds(1800), "30 Mins");
    assert.equal(formatHowLongToBeatSeconds(3600), "1 Hours");
  });

  it("returns -- when there is no time", () => {
    assert.equal(formatHowLongToBeatSeconds(0), "--");
    assert.equal(formatHowLongToBeatSeconds(undefined), "--");
  });
});

describe("pickHowLongToBeatEntry", () => {
  const entry = (over: object) => ({ comp_main: 3600, ...over });

  it("matches the same title, ignoring punctuation and editions", () => {
    const hit = entry({ game_name: "Castlevania: Belmont's Curse" });
    assert.equal(
      pickHowLongToBeatEntry([hit], "Castlevania Belmonts Curse"),
      hit
    );
  });

  it("never picks a sequel or a different game", () => {
    assert.equal(
      pickHowLongToBeatEntry(
        [entry({ game_name: "Dishonored 2" })],
        "Dishonored"
      ),
      null
    );
  });

  it("skips entries without times and prefers the base game", () => {
    const dlc = entry({ game_name: "Hades", game_type: "dlc", count_comp: 99 });
    const empty = { game_name: "Hades", game_type: "game", comp_main: 0 };
    const base = entry({
      game_name: "Hades",
      game_type: "game",
      count_comp: 5,
    });
    assert.equal(pickHowLongToBeatEntry([dlc, empty, base], "Hades"), base);
  });

  it("matches an alias", () => {
    const hit = entry({ game_name: "NieR", game_alias: "Nier Replicant, X" });
    assert.equal(pickHowLongToBeatEntry([hit], "Nier Replicant"), hit);
  });

  it("returns null for no results", () => {
    assert.equal(pickHowLongToBeatEntry(undefined, "Hades"), null);
    assert.equal(pickHowLongToBeatEntry([], "Hades"), null);
  });
});

describe("howLongToBeatCategoriesFromEntry", () => {
  it("produces categories parseHowLongToBeat understands", () => {
    const categories = howLongToBeatCategoriesFromEntry({
      comp_main: 43983,
      comp_plus: 69718,
      comp_100: 84629,
    });
    assert.deepEqual(parseHowLongToBeat(categories), {
      mainStory: 12,
      mainExtra: 19.5,
      completionist: 23.5,
    });
  });
});
