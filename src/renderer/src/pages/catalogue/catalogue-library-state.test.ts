import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-ignore The Node ESM test runner requires the source extension.
import { getCatalogueLibraryStates } from "./catalogue-library-state.ts";

interface Game {
  shop: string;
  objectId: string;
  installed: boolean;
  catalogueGame?: { shop: string; objectId: string };
}

const states = (library: Game[]) =>
  getCatalogueLibraryStates(library, (game) => game.installed);

describe("getCatalogueLibraryStates", () => {
  it("marks owned and installed games by their own key", () => {
    const result = states([
      { shop: "steam", objectId: "1", installed: false },
      { shop: "steam", objectId: "2", installed: true },
    ]);
    assert.equal(result.get("steam:1"), "owned");
    assert.equal(result.get("steam:2"), "installed");
    assert.equal(result.get("steam:3"), undefined);
  });

  it("marks the catalogue game a copy is linked to", () => {
    const result = states([
      {
        shop: "epic",
        objectId: "abc",
        installed: false,
        catalogueGame: { shop: "steam", objectId: "9" },
      },
    ]);
    assert.equal(result.get("steam:9"), "owned");
  });

  it("lets an installed copy win over an owned one", () => {
    const result = states([
      {
        shop: "custom",
        objectId: "x",
        installed: true,
        catalogueGame: { shop: "steam", objectId: "9" },
      },
      { shop: "steam", objectId: "9", installed: false },
    ]);
    assert.equal(result.get("steam:9"), "installed");
  });
});
