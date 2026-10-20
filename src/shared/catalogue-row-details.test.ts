import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as rowDetails from "./catalogue-row-details.ts";

const {
  buildCatalogueRowDetails,
  getCriticScoreTone,
  getMatchingDownloadSizes,
} = rowDetails;

describe("catalogue row details", () => {
  it("keeps the score, the median download and a few screenshots", () => {
    const details = buildCatalogueRowDetails({
      steamDetails: {
        metacritic: { score: 94 },
        screenshots: Array.from({ length: 8 }, (_, index) => ({
          path_thumbnail: `thumb-${index}.jpg`,
          path_full: `full-${index}.jpg`,
        })),
      },
      howLongToBeatHours: 60,
      downloadSizes: [null, 50, 0, 20, 30, 1],
    });

    assert.equal(details.criticScore, 94);
    assert.equal(details.howLongToBeatHours, 60);
    assert.equal(details.downloadSize, 20);
    assert.deepEqual(details.screenshots, [
      "thumb-0.jpg",
      "thumb-1.jpg",
      "thumb-2.jpg",
      "thumb-3.jpg",
      "thumb-4.jpg",
    ]);
  });

  it("returns empty details when nothing is known", () => {
    assert.deepEqual(buildCatalogueRowDetails({}), {
      criticScore: null,
      howLongToBeatHours: null,
      downloadSize: null,
      screenshots: [],
    });
    assert.equal(
      buildCatalogueRowDetails({ steamDetails: { metacritic: { score: 0 } } })
        .criticScore,
      null
    );
  });

  it("only counts downloads named after the game", () => {
    assert.deepEqual(
      getMatchingDownloadSizes("Grand Theft Auto V", [
        {
          title: "Grand Theft Auto V [P] [RUS + ENG] (2015) (1.0.3351)",
          size: 110,
        },
        {
          title: "[DL] Grand Theft Auto: Vice City - The Definitive Edition",
          size: 9,
        },
        {
          title: "Grand Theft Auto V – V 3725.0 Online 1.72 / Build 21197051",
          size: 114,
        },
      ]),
      [110, 114]
    );
  });

  it("bands scores like Metacritic", () => {
    assert.equal(getCriticScoreTone(80), "good");
    assert.equal(getCriticScoreTone(60), "mixed");
    assert.equal(getCriticScoreTone(40), "bad");
  });
});
