import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as storeRating from "./store-rating.ts";

const { getStoreRating, getRatingQuality } = storeRating;

describe("getStoreRating", () => {
  it("ranks 100 % of 40 reviews below 96 % of 60,000", () => {
    const small = getStoreRating({ reviewPercent: 100, reviewCount: 40 });
    const large = getStoreRating({ reviewPercent: 96, reviewCount: 60_000 });
    assert.ok(small && large);
    assert.ok(small.value < large.value);
    assert.ok(large.value > 93 && large.value < 96);
  });

  it("is null under ten reviews and no critic score", () => {
    assert.equal(getStoreRating({ reviewPercent: 100, reviewCount: 9 }), null);
    assert.equal(getStoreRating({ reviewPercent: null, reviewCount: 0 }), null);
  });

  it("uses Metacritic alone when Steam has too few reviews", () => {
    const rating = getStoreRating({
      reviewPercent: 100,
      reviewCount: 3,
      criticScore: 81,
    });
    assert.equal(rating?.value, 81);
    assert.equal(rating?.steam, null);
  });

  it("lets critics count more where players have said little", () => {
    const few = getStoreRating({
      reviewPercent: 90,
      reviewCount: 30,
      criticScore: 60,
    });
    const many = getStoreRating({
      reviewPercent: 90,
      reviewCount: 100_000,
      criticScore: 60,
    });
    assert.ok(few && many && few.steam !== null && many.steam !== null);
    // The share of the way from the Steam part toward the critic score.
    const pull = (rating: NonNullable<typeof few>) =>
      ((rating.steam as number) - rating.value) /
      ((rating.steam as number) - (rating.critic as number));
    assert.ok(pull(few) > pull(many));
  });

  it("gives a neutral quality when there is nothing to go on", () => {
    assert.equal(
      getRatingQuality({ reviewPercent: null, reviewCount: 0 }),
      0.5
    );
  });
});
