import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createNoticeBoard } from "./in-game-notices-core.ts";

const setup = () => {
  let time = 1000;
  const files = new Map<string, string>();
  const timers: { callback: () => void; at: number }[] = [];
  const board = createNoticeBoard({
    write: async (filePath, content) => void files.set(filePath, content),
    now: () => time,
    setTimer: (callback, ms) => {
      const timer = { callback, at: time + ms };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      const index = timers.indexOf(timer as (typeof timers)[number]);
      if (index >= 0) timers.splice(index, 1);
    },
    noticeMs: 6000,
  });
  const advance = async (ms: number) => {
    time += ms;
    for (const timer of timers.filter((t) => t.at <= time)) {
      timers.splice(timers.indexOf(timer), 1);
      timer.callback();
    }
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { board, files, advance };
};

describe("createNoticeBoard", () => {
  it("shows a notice in the game's config and takes it out again", async () => {
    const { board, files, advance } = setup();
    board.register("steam:1", "/c.conf", "fps\n");

    await board.show("steam:1", ["Achievement unlocked: A"]);
    assert.equal(
      files.get("/c.conf"),
      "fps\ncustom_text_center=Achievement unlocked: A\n"
    );

    await advance(6100);
    assert.equal(files.get("/c.conf"), "fps\n");
  });

  it("does nothing for a game without a registered config", () => {
    const { board, files } = setup();
    assert.equal(board.show("steam:2", ["x"]), null);
    assert.equal(files.size, 0);
  });

  it("restores the config when the game ends", async () => {
    const { board, files } = setup();
    board.register("steam:1", "/c.conf", "base\n");
    await board.show("steam:1", ["x"]);
    await board.unregister("steam:1");
    assert.equal(files.get("/c.conf"), "base\n");
    assert.equal(board.isActive("steam:1"), false);
  });
});
