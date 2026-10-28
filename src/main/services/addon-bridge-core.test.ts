import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { handleAddonRequest } from "./addon-bridge-core.js";

const PORT = 41907;
const good = {
  method: "GET",
  url: "/game?shop=steam&objectId=620",
  host: `127.0.0.1:${PORT}`,
  origin: "moz-extension://abc-123",
};
const hades = { objectId: "1145350", name: "Hades II" };
const ask = (overrides = {}, state = "installed" as const) =>
  handleAddonRequest({ ...good, ...overrides }, PORT, {
    getGameState: async () => state,
    resolveTitle: async (title) => (title === "Hades II" ? hades : null),
  });

describe("add-on bridge", () => {
  it("reports the game's state to an extension", async () => {
    const response = await ask();
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { state: "installed" });
    assert.equal(response.headers["Access-Control-Allow-Origin"], good.origin);
  });

  it("refuses web pages and requests without an origin", async () => {
    assert.equal((await ask({ origin: "https://evil.example" })).status, 403);
    assert.equal((await ask({ origin: undefined })).status, 403);
  });

  it("refuses a foreign host name", async () => {
    assert.equal((await ask({ host: `evil.example:${PORT}` })).status, 403);
  });

  it("only accepts Steam app ids", async () => {
    assert.equal((await ask({ url: "/game?objectId=abc" })).status, 400);
    assert.equal(
      (await ask({ url: "/game?shop=epic&objectId=1" })).status,
      400
    );
    assert.equal((await ask({ url: "/other" })).status, 404);
  });

  it("resolves a title to a Steam game and its state", async () => {
    const response = await ask({ url: "/resolve?title=Hades%20II" });
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), {
      ...hades,
      state: "installed",
    });
    assert.equal((await ask({ url: "/resolve?title=Nope" })).status, 404);
  });

  it("refuses an empty or oversized title", async () => {
    assert.equal((await ask({ url: "/resolve?title=%20" })).status, 400);
    assert.equal((await ask({ url: "/resolve" })).status, 400);
    const long = "a".repeat(201);
    assert.equal((await ask({ url: `/resolve?title=${long}` })).status, 400);
  });

  it("holds /resolve to the same origin checks", async () => {
    const url = "/resolve?title=Hades%20II";
    assert.equal(
      (await ask({ url, origin: "https://evil.example" })).status,
      403
    );
    assert.equal(
      (await ask({ url, host: `evil.example:${PORT}` })).status,
      403
    );
  });
});
