import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as rowDetails from "./catalogue-row-details.ts";

const {
  buildStoreGameFacts,
  getCriticScoreTone,
  getReviewTone,
  getReviewLabel,
  getMatchingDownloadSizes,
} = rowDetails;

describe("store game facts", () => {
  it("keeps the score, the median download and a few screenshots", () => {
    const details = buildStoreGameFacts({
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
    assert.deepEqual(buildStoreGameFacts({}), {
      criticScore: null,
      howLongToBeatHours: null,
      downloadSize: null,
      screenshots: [],
      tagIds: [],
      reviewPercent: null,
      reviewCount: null,
      releaseYear: null,
      description: null,
    });
    assert.equal(
      buildStoreGameFacts({ steamDetails: { metacritic: { score: 0 } } })
        .criticScore,
      null
    );
  });

  it("turns Steam's short description into plain text", () => {
    assert.equal(
      buildStoreGameFacts({
        steamDetails: {
          short_description:
            "Rock &amp; <b>stone</b>, &quot;to the bone&quot;!  ",
        },
      }).description,
      'Rock & stone , "to the bone"!'
    );
    assert.equal(
      buildStoreGameFacts({ steamDetails: { short_description: " " } })
        .description,
      null
    );
  });

  it("keeps the first few Steam tag ids as numbers", () => {
    assert.deepEqual(
      buildStoreGameFacts({
        tagIds: ["122", 4182, "19", "21", "492"],
      }).tagIds,
      [122, 4182, 19, 21]
    );
  });

  it("keeps Steam's reviews and takes the year from the search result first", () => {
    const facts = buildStoreGameFacts({
      reviews: { percentPositive: 96, count: 62210 },
      steamReleaseDate: Date.UTC(2020, 5, 1) / 1000,
      releaseYear: 2019,
    });
    assert.equal(facts.reviewPercent, 96);
    assert.equal(facts.reviewCount, 62210);
    assert.equal(facts.releaseYear, 2019);
  });

  it("falls back to Steam's release date for the year", () => {
    assert.equal(
      buildStoreGameFacts({ steamReleaseDate: Date.UTC(2020, 5, 1) / 1000 })
        .releaseYear,
      2020
    );
    assert.equal(
      buildStoreGameFacts({ steamReleaseDate: 0 }).releaseYear,
      null
    );
  });

  it("leaves reviews out when the game has none", () => {
    const facts = buildStoreGameFacts({
      reviews: { percentPositive: 0, count: 0 },
    });
    assert.equal(facts.reviewPercent, null);
    assert.equal(facts.reviewCount, null);
  });

  it("bands review scores like Steam and shows none under ten reviews", () => {
    assert.equal(getReviewTone(96, 62210), "positive");
    assert.equal(getReviewTone(70, 100), "positive");
    assert.equal(getReviewTone(69, 100), "mixed");
    assert.equal(getReviewTone(40, 100), "mixed");
    assert.equal(getReviewTone(39, 100), "negative");
    assert.equal(getReviewTone(100, 9), null);
    assert.equal(getReviewTone(null, 100), null);
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

  it("words review scores like Steam", () => {
    assert.equal(getReviewLabel(97, 287678), "overwhelmingly_positive");
    assert.equal(getReviewLabel(97, 200), "very_positive");
    assert.equal(getReviewLabel(85, 20), "positive");
    assert.equal(getReviewLabel(75, 1000), "mostly_positive");
    assert.equal(getReviewLabel(55, 1000), "mixed");
    assert.equal(getReviewLabel(30, 1000), "mostly_negative");
    assert.equal(getReviewLabel(10, 1000), "overwhelmingly_negative");
    assert.equal(getReviewLabel(10, 100), "very_negative");
    assert.equal(getReviewLabel(10, 20), "negative");
    assert.equal(getReviewLabel(100, 5), null);
  });
});
