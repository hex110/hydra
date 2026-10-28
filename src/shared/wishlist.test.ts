import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isWishlistOnly } from "./wishlist.js";

const wished = { wishlisted: true, playTimeInMilliseconds: 0 };

describe("isWishlistOnly", () => {
  it("accepts a wish that was never added to the library", () => {
    assert.equal(isWishlistOnly(wished), true);
  });

  it("is false once the game is in the library", () => {
    assert.equal(
      isWishlistOnly({ ...wished, addedToLibraryAt: new Date() }),
      false
    );
  });

  it("is false for a game that is not wishlisted", () => {
    assert.equal(isWishlistOnly({ ...wished, wishlisted: false }), false);
  });

  it("is false once the game has a download, executable or playtime", () => {
    assert.equal(isWishlistOnly({ ...wished, download: {} }), false);
    assert.equal(
      isWishlistOnly({ ...wished, executablePath: "/g.exe" }),
      false
    );
    assert.equal(
      isWishlistOnly({ ...wished, playTimeInMilliseconds: 5 }),
      false
    );
  });

  it("leaves imported wishlist entries listed", () => {
    assert.equal(
      isWishlistOnly({ ...wished, steamWishlistImported: true }),
      false
    );
  });
});
