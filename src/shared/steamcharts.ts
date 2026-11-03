/** One row of steamcharts.com's top list (25 games a page, by current players). */
export interface SteamChartsTopRow {
  appId: string;
  name: string;
  /** Players in game when the page was made. */
  current: number;
  /** Highest number of players in the last 30 days. */
  peak: number;
  /** Player-hours in the last 30 days. */
  hours: number;
}

export interface SteamChartsMonth {
  /** Calendar month, 1–12. */
  month: number;
  year: number;
  averagePlayers: number;
  peak: number;
}

/** A game's page on steamcharts.com: the last 30 days and each full month. */
export interface SteamChartsApp {
  last30: { averagePlayers: number; peak: number } | null;
  /** Newest first. */
  months: SteamChartsMonth[];
}

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const rowsOf = (html: string) => html.match(/<tr[\s>][\s\S]*?<\/tr>/g) ?? [];

/** steamcharts.com/top and /top/p.N. Rows it cannot read are skipped. */
export const parseSteamChartsTop = (html: string): SteamChartsTopRow[] =>
  rowsOf(html).flatMap((row) => {
    const link = /<a href="\/app\/(\d+)"[^>]*>([\s\S]*?)<\/a>/.exec(row);
    const current = /<td class="num">(\d+)<\/td>/.exec(row);
    const peak = /class="num period-col peak-concurrent">(\d+)</.exec(row);
    const hours = /class="num period-col player-hours">(\d+)</.exec(row);
    if (!link || !current || !peak || !hours) return [];

    return [
      {
        appId: link[1],
        name: text(link[2]),
        current: Number(current[1]),
        peak: Number(peak[1]),
        hours: Number(hours[1]),
      },
    ];
  });

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** steamcharts.com/app/<id>. Null when the page has no monthly table. */
export const parseSteamChartsApp = (html: string): SteamChartsApp | null => {
  const app: SteamChartsApp = { last30: null, months: [] };

  for (const row of rowsOf(html)) {
    const label = /month-cell left[^"]*">\s*([\s\S]*?)\s*<\/td>/.exec(row);
    const average = /class="right num-f[^"]*">\s*([\d.]+)\s*</.exec(row);
    const peak = /class="right num[^"-]*">\s*(\d+)\s*</.exec(row);
    if (!label || !average || !peak) continue;

    const name = text(label[1]).toLowerCase();
    const averagePlayers = Number(average[1]);

    if (name === "last 30 days") {
      app.last30 = { averagePlayers, peak: Number(peak[1]) };
      continue;
    }

    const [monthName, year] = name.split(" ");
    const month = MONTHS.indexOf(monthName) + 1;
    if (month > 0 && Number(year) > 0) {
      app.months.push({
        month,
        year: Number(year),
        averagePlayers,
        peak: Number(peak[1]),
      });
    }
  }

  return app.last30 || app.months.length > 0 ? app : null;
};

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;
const EXTRA_MONTHS = 2;

/**
 * Roughly the last 90 days: the last 30 days plus the two full months that end
 * before them. The months are averaged with the 30 days as equals, and a game
 * missing from a month counts as no players, so a new release ranks by what it
 * has had. Null when the page has no recent figures.
 */
export const getNinetyDayFigures = (
  app: SteamChartsApp,
  now: number
): { averagePlayers: number; peak: number } | null => {
  if (!app.last30) return null;

  const windowStart = now - WINDOW_DAYS * DAY_MS;
  const before = app.months
    .filter(
      ({ year, month }) => Date.UTC(year, month, 1) <= windowStart // the month's end
    )
    .slice(0, EXTRA_MONTHS);

  const parts = [app.last30, ...before];
  return {
    averagePlayers:
      (app.last30.averagePlayers +
        before.reduce((sum, entry) => sum + entry.averagePlayers, 0)) /
      (1 + EXTRA_MONTHS),
    peak: Math.max(...parts.map((part) => part.peak)),
  };
};
