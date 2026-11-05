import assert from "node:assert/strict";
import { it } from "node:test";
import type { LibraryGame } from "@types";
import { orderRunningGames } from "./sidebar-order.js";

const game = (id: string) => ({ id }) as unknown as LibraryGame;

it("puts the game started last first, whatever the library order", () => {
  const games = [game("a"), game("b"), game("c"), game("d")];
  const ordered = orderRunningGames(games, ["c", "a", "b"]);
  assert.deepEqual(
    ordered.map((item) => item.id),
    ["b", "a", "c"]
  );
});

it("returns nothing when no game is running", () => {
  assert.deepEqual(orderRunningGames([game("a")], []), []);
});
