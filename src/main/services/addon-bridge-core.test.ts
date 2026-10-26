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
const ask = (overrides = {}, state = "installed" as const) =>
  handleAddonRequest({ ...good, ...overrides }, PORT, async () => state);

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
});
