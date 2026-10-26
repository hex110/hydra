import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeTaskError } from "./background-task-errors.ts";

const http = (status: number) => ({
  isAxiosError: true,
  message: `Request failed with status code ${status}`,
  response: { status },
});

describe("describeTaskError", () => {
  it("reads a stopped or missing server as unreachable", () => {
    assert.equal(
      describeTaskError({ isAxiosError: true, code: "ECONNREFUSED" }),
      "unreachable"
    );
    assert.equal(
      describeTaskError({ isAxiosError: true, code: "ECONNABORTED" }),
      "unreachable"
    );
    assert.equal(describeTaskError({ isAxiosError: true }), "unreachable");
  });

  it("maps HTTP statuses", () => {
    assert.equal(describeTaskError(http(401)), "unauthorized");
    assert.equal(describeTaskError(http(403)), "unauthorized");
    assert.equal(describeTaskError(http(429)), "rate-limited");
    assert.equal(describeTaskError(http(502)), "server");
    assert.equal(describeTaskError(http(404)), "unknown");
  });

  it("recognises the services' own errors", () => {
    assert.equal(
      describeTaskError(new Error("steam-history-private-or-empty")),
      "private-profile"
    );
    assert.equal(
      describeTaskError(new Error("floppy-not-configured")),
      "not-configured"
    );
    assert.equal(describeTaskError(new Error("boom")), "unknown");
    assert.equal(describeTaskError(null), "unknown");
  });
});
