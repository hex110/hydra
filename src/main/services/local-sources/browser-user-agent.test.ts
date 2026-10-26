import { describe, it } from "node:test";
import assert from "node:assert";
import { toBrowserUserAgent } from "./browser-user-agent.js";

describe("toBrowserUserAgent", () => {
  it("drops the Electron and app tokens", () => {
    assert.strictEqual(
      toBrowserUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) hydra-plus/3.9.0-plus.1 Chrome/146.0.0.0 Electron/41.10.3 Safari/537.36"
      ),
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
    );
  });

  it("leaves a plain browser user agent alone", () => {
    const chrome =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";
    assert.strictEqual(toBrowserUserAgent(chrome), chrome);
  });
});
