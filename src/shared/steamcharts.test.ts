import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as steamcharts from "./steamcharts.ts";

const { parseSteamChartsTop, parseSteamChartsApp, getNinetyDayFigures } =
  steamcharts;

// Rows as steamcharts.com served them on 2026-11-03.
const TOP_HTML =
  '<table><tbody><tr class="odd">\n\t\t\t\t<td>1.</td>\n\t\t\t\t<td class="game-name left">\n\t\t\t\t\t<a href="/app/730">\n\t\t\t\t\t\tCounter-Strike 2\n\t\t\t\t\t</a>\n\t\t\t\t</td>\n\t\t\t\t<td class="num">918135</td>\n\t\t\t\t<td id="spark_730" class="chart period-col"></td>\n\t\t\t\t<td class="num period-col peak-concurrent">1402441</td>\n\t\t\t\t<td class="num period-col player-hours">580272987</td>\n\t\t\t</tr><tr >\n\t\t\t\t<td>2.</td>\n\t\t\t\t<td class="game-name left">\n\t\t\t\t\t<a href="/app/4115450">\n\t\t\t\t\t\tPhantom Blade Zero\n\t\t\t\t\t</a>\n\t\t\t\t</td>\n\t\t\t\t<td class="num">656312</td>\n\t\t\t\t<td id="spark_4115450" class="chart period-col"></td>\n\t\t\t\t<td class="num period-col peak-concurrent">823104</td>\n\t\t\t\t<td class="num period-col player-hours">41738719</td>\n\t\t\t</tr></tbody></table>';
const APP_HTML =
  '<table><tbody><tr class="odd">\n\t\t\t\t<td class="month-cell left italic">Last 30 Days</td>\n\t\t\t\t<td class="right num-f italic">790562.65</td>\n\t\t\t\t<td class="right num-p gainorloss italic">-6761.5</td>\n\t\t\t\t<td class="right gainorloss italic">-0.85%</td>\n\t\t\t\t<td class="right num italic">1402441</td>\n\t\t\t</tr><tr >\n\t\t\t\t\n\t\t\t\t<td class="month-cell left">\n\t\t\t\t\tOctober 2026\n\t\t\t\t</td>\n\t\t\t\t\n\t\t\t\t<td class="right num-f">797324.15</td>\n\t\t\t\t<td class="right num-p gainorloss">-8313.68</td>\n\t\t\t\t<td class="right gainorloss">-1.03%</td>\n\t\t\t\t<td class="right num">1402441</td>\n\t\t\t</tr><tr class="odd">\n\t\t\t\t\n\t\t\t\t<td class="month-cell left">\n\t\t\t\t\tSeptember 2026\n\t\t\t\t</td>\n\t\t\t\t\n\t\t\t\t<td class="right num-f">805637.82</td>\n\t\t\t\t<td class="right num-p gainorloss">-19619.98</td>\n\t\t\t\t<td class="right gainorloss">-2.38%</td>\n\t\t\t\t<td class="right num">1450705</td>\n\t\t\t</tr><tr >\n\t\t\t\t\n\t\t\t\t<td class="month-cell left">\n\t\t\t\t\tAugust 2026\n\t\t\t\t</td>\n\t\t\t\t\n\t\t\t\t<td class="right num-f">825257.80</td>\n\t\t\t\t<td class="right num-p gainorloss">-27974.65</td>\n\t\t\t\t<td class="right gainorloss">-3.28%</td>\n\t\t\t\t<td class="right num">1331274</td>\n\t\t\t</tr></tbody></table>';

describe("parseSteamChartsTop", () => {
  it("reads app id, name, current players, 30-day peak and hours", () => {
    const rows = parseSteamChartsTop(TOP_HTML);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], {
      appId: "730",
      name: "Counter-Strike 2",
      current: 918135,
      peak: 1402441,
      hours: 580272987,
    });
    assert.equal(rows[1].appId, "4115450");
  });

  it("skips the header and unreadable rows", () => {
    assert.deepEqual(
      parseSteamChartsTop("<tr><th>Name</th></tr><tr><td>x</td></tr>"),
      []
    );
  });
});

describe("parseSteamChartsApp", () => {
  it("reads the last 30 days and each month, newest first", () => {
    const app = parseSteamChartsApp(APP_HTML);
    assert.equal(app?.last30?.averagePlayers, 790562.65);
    assert.equal(app?.last30?.peak, 1402441);
    assert.deepEqual(app?.months[0], {
      month: 10,
      year: 2026,
      averagePlayers: 797324.15,
      peak: 1402441,
    });
    assert.equal(app?.months[1].month, 9);
  });

  it("is null for a page without a table", () => {
    assert.equal(parseSteamChartsApp("<html></html>"), null);
  });
});

describe("getNinetyDayFigures", () => {
  const app = {
    last30: { averagePlayers: 300, peak: 900 },
    months: [
      { month: 10, year: 2026, averagePlayers: 999, peak: 5000 },
      { month: 9, year: 2026, averagePlayers: 600, peak: 1000 },
      { month: 8, year: 2026, averagePlayers: 0, peak: 100 },
    ],
  };

  it("averages the last 30 days with the two months before them", () => {
    // On 3 November the last 30 days start on 4 October, so October overlaps.
    const figures = getNinetyDayFigures(app, Date.UTC(2026, 10, 3));
    assert.equal(figures?.averagePlayers, 300);
    assert.equal(figures?.peak, 1000);
  });

  it("counts a new release's missing months as no players", () => {
    const figures = getNinetyDayFigures(
      { last30: { averagePlayers: 600, peak: 800 }, months: [] },
      Date.UTC(2026, 10, 3)
    );
    assert.equal(figures?.averagePlayers, 200);
  });

  it("is null without the last 30 days", () => {
    assert.equal(
      getNinetyDayFigures({ last30: null, months: [] }, Date.now()),
      null
    );
  });
});
