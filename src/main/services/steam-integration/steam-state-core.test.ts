import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isSteamProcessName,
  isSteamRunning,
  parseSteamPid,
} from "./steam-state-core.ts";

describe("parseSteamPid", () => {
  it("reads decimal and hexadecimal pids", () => {
    assert.equal(parseSteamPid("39786\n"), 39786);
    assert.equal(parseSteamPid("0x4d2"), 1234);
  });

  it("rejects empty, zero and garbage", () => {
    for (const value of [null, undefined, "", "0", "0x0", "abc", "-5", "1.5"]) {
      assert.equal(parseSteamPid(value), null);
    }
  });
});

describe("isSteamRunning", () => {
  it("needs a pid file and a live process called steam", () => {
    assert.equal(
      isSteamRunning({ pidFile: "39786", processName: "steam" }),
      true
    );
    assert.equal(
      isSteamRunning({ pidFile: "39786", processName: "firefox" }),
      false
    );
    assert.equal(
      isSteamRunning({ pidFile: "39786", processName: null }),
      false
    );
    assert.equal(
      isSteamRunning({ pidFile: null, processName: "steam" }),
      false
    );
  });

  it("accepts any live process where names are not available", () => {
    assert.equal(
      isSteamRunning({
        pidFile: "0x4d2",
        processName: "",
        trustLiveProcess: true,
      }),
      true
    );
  });

  it("recognises Steam's process names", () => {
    assert.equal(isSteamProcessName("steam.exe"), true);
    assert.equal(isSteamProcessName("Steam"), true);
    assert.equal(isSteamProcessName("steamwebhelper"), false);
  });
});
