import { describe, it } from "node:test";
import assert from "node:assert";
import {
  parseHyprlandRefreshRate,
  parseXrandrRefreshRate,
} from "./display-refresh-rate.ts";

const monitors = JSON.stringify([
  { name: "DP-2", refreshRate: 143.97, focused: false },
  { name: "DP-1", refreshRate: 240.085, focused: true },
]);

const xrandr = `Screen 0: minimum 16 x 16, current 6880 x 1440, maximum 32767 x 32767
DP-2 connected 3440x1440+3440+0 (normal left inverted right x axis y axis) 800mm x 330mm
   3440x1440    143.97*+
DP-1 connected primary 3440x1440+0+0 (normal left inverted right x axis y axis) 800mm x 330mm
   3440x1440    240.01*+
   2560x1440     59.95 +
`;

describe("parseHyprlandRefreshRate", () => {
  it("reads the named monitor", () => {
    assert.strictEqual(parseHyprlandRefreshRate(monitors, "DP-2"), 143.97);
  });

  it("falls back to the focused monitor", () => {
    assert.strictEqual(parseHyprlandRefreshRate(monitors, "HDMI-1"), 240.085);
    assert.strictEqual(parseHyprlandRefreshRate(monitors, null), 240.085);
  });

  it("returns null for output it can't read", () => {
    assert.strictEqual(parseHyprlandRefreshRate("not json", null), null);
    assert.strictEqual(parseHyprlandRefreshRate("[]", null), null);
  });
});

describe("parseXrandrRefreshRate", () => {
  it("reads the current mode of the named output", () => {
    assert.strictEqual(parseXrandrRefreshRate(xrandr, "DP-1"), 240.01);
    assert.strictEqual(parseXrandrRefreshRate(xrandr, "DP-2"), 143.97);
  });

  it("falls back to the first current mode", () => {
    assert.strictEqual(parseXrandrRefreshRate(xrandr, "HDMI-1"), 143.97);
    assert.strictEqual(parseXrandrRefreshRate(xrandr, null), 143.97);
  });
});
