import { describe, it } from "node:test";
import assert from "node:assert";
import {
  cleanReleaseName,
  comparableTitle,
  isSameTitle,
  titleSimilarity,
} from "./title-matching.js";

describe("cleanReleaseName", () => {
  const cases: [string, string][] = [
    ["Cyberpunk.2077.v2.3-FitGirl", "Cyberpunk 2077"],
    ["Hades II [DODI Repack]", "Hades II"],
    ["AceCombat8", "Ace Combat 8"],
    ["ItTakesTwo", "It Takes Two"],
    ["r2modman", "r2modman"],
    ["Elden Ring - FitGirl Repack", "Elden Ring"],
    ["Elden Ring v1.12 + All DLCs - FitGirl Repack", "Elden Ring"],
    ["Baldurs_Gate_3", "Baldurs Gate 3"],
    ["Stardew Valley (Build 12345678)", "Stardew Valley"],
    ["Hollow Knight Build 1578", "Hollow Knight"],
    ["Satisfactory-RUNE", "Satisfactory"],
    ["DOOM Eternal (v6.66 Rev 2.2) MULTi10", "DOOM Eternal"],
    ["The Witcher® 3: Wild Hunt", "The Witcher 3: Wild Hunt"],
    ["Halo Infinite", "Halo Infinite"],
    ["Portal 2", "Portal 2"],
    ["Going Medieval – V 1.2.12 / Build 25933619", "Going Medieval"],
    ["Mini Motorways – Build 25381668", "Mini Motorways"],
    [
      "Survivalist: Invisible Strain – V 272 / Build 22802494",
      "Survivalist: Invisible Strain",
    ],
    ["Stardew Valley V 1.6.14 – V 1.6.14 / Build 16375315", "Stardew Valley"],
    ["Brotato – v1.1.12.1 / Build 20236656", "Brotato"],
    ["Grand Theft Auto V", "Grand Theft Auto V"],
    ["Escape Simulator 2 – V 22715r / Build 25386453", "Escape Simulator 2"],
    ["Way of the Hunter 2 – Build: 25630108", "Way of the Hunter 2"],
    ["Rocky V - Remastered", "Rocky V Remastered"],
    ["DMD.CH4-1.01-pc", "DMD CH4"],
    ["Some.Game.1.2.3", "Some Game"],
    ["Spider-Man.2", "Spider-Man 2"],
    ["Game Name-v1.0.4-Win64", "Game Name"],
  ];

  for (const [input, expected] of cases) {
    it(`cleans ${JSON.stringify(input)}`, () => {
      assert.strictEqual(cleanReleaseName(input), expected);
    });
  }
});

describe("isSameTitle", () => {
  it("ignores punctuation, case and roman numerals", () => {
    assert.ok(isSameTitle("Hades II", "hades 2"));
    assert.ok(
      isSameTitle("The Witcher 3: Wild Hunt", "The Witcher 3 Wild Hunt")
    );
    assert.ok(isSameTitle("Baldur's Gate 3", "Baldurs Gate 3"));
    assert.ok(isSameTitle("Ratchet & Clank", "Ratchet and Clank"));
  });

  it("treats editions as the same game", () => {
    assert.ok(isSameTitle("Hades", "Hades Deluxe Edition"));
    assert.ok(
      isSameTitle(
        "Red Dead Redemption 2",
        "Red Dead Redemption 2 Ultimate Edition"
      )
    );
    assert.ok(isSameTitle("Fallout 4", "Fallout 4 Game of the Year Edition"));
  });

  it("keeps sequels and spin-offs apart", () => {
    assert.ok(!isSameTitle("Dishonored", "Dishonored 2"));
    assert.ok(!isSameTitle("Hades", "Hades II"));
    assert.ok(!isSameTitle("Portal", "Portal 2"));
    assert.ok(!isSameTitle("Fallout 4", "Fallout 4 VR"));
  });

  it("never matches empty titles", () => {
    assert.ok(!isSameTitle("", ""));
    assert.strictEqual(comparableTitle("™"), "");
  });
});

describe("titleSimilarity", () => {
  it("scores exact matches as 1", () => {
    assert.strictEqual(titleSimilarity("Hades II", "Hades 2"), 1);
  });

  it("scores partial overlaps between 0 and 1", () => {
    const score = titleSimilarity("Dark Souls Remastered", "Dark Souls III");
    assert.ok(score > 0 && score < 1);
  });

  it("scores unrelated titles as 0", () => {
    assert.strictEqual(titleSimilarity("Celeste", "Hollow Knight"), 0);
  });
});
