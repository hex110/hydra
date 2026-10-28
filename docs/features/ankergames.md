# AnkerGames

Hydra Plus lists AnkerGames releases itself, without a third-party source
JSON, and shows them first on game pages. It is on by default and controlled
by **List AnkerGames downloads** in **Settings → Download sources**.

## Game list

- The list comes from the public sitemaps: `sitemap.xml` → every
  `sitemap_post_N.xml` → one `https://ankergames.net/game/<slug>` per game
  (about 2,150 in October 2026). It is cached in
  `<userData>/ankergames/catalogue.json` and read again once a day, on
  **Sync sources** and on **Refresh list**.
- Games are matched by slug: `baldurs-gate-3` and "Baldur's Gate 3" share the
  same key ([local source matching](local-source-matching.md) explains the
  key).
- When a game page opens and its slug matches, Hydra reads that one AnkerGames
  page for the name, version, size and date (the page's JSON-LD `VideoGame`
  data) and the download button ids. Pages are cached for a day in
  `<userData>/ankergames/pages.json`, failures for an hour, and requests go
  out one at a time with a second between them, so an update check over a
  big library stays gentle. A page that loads but has no download button is
  left out.
- The release is shown as `<name> – V <version>` with the link
  `https://ankergames.net/game/<slug>`, and sorts first in **Download
  options**. Preselection (browser add-on, update checks) also ranks
  AnkerGames first unless the preferred-source order lists it elsewhere.
- Everything here reads pages robots.txt allows; no download link is stored.

## Catalogue rows

The catalogue's front page has **New on AnkerGames** and **Trending on
AnkerGames** rows, so you can see what the site added or is downloading
without opening it. They follow **List AnkerGames downloads**: switched off,
the rows are gone.

- **New** is the "Latest Games" row of `https://ankergames.net/`, newest
  first, with the release shown on each card (`V 1.0.23.3`).
- **Trending** is the weekly chart at `https://ankergames.net/trending`
  ("Trending This Week", ranked by the last seven days of downloads), best
  first, each card showing `No. 4 this week`. The first 16 places are kept.
  The home page's own "Trending Games" row is not used: it is mostly the
  same games as the latest row.
- **Read once a day.** Hydra reads both pages the first time it starts on a
  new calendar day (local time), in the background after startup, and keeps
  the result in `<userData>/ankergames/home.json`. Opening the catalogue
  later the same day reads nothing. If the app stays open past midnight,
  the next catalogue visit does the read. A read that failed, or left some
  games unresolved, is tried again at most once an hour. A new copy reaches
  an open catalogue by itself.
- **Opening a game.** AnkerGames' cards carry no Steam id, so each game's
  page is read (through the same one-a-day page cache as
  [game lists](#game-list), in its own request lane so it never delays a
  download lookup) for its `steam_app_id`. A card opens that Steam game's
  normal page. Games without a Steam id (console titles such as
  Bloodborne, Minecraft) can't be opened in Hydra and are left out, so a row
  can show fewer games than the site does. Images and titles come from Steam
  through Hydra's API, which is where the hashed `header.jpg` URL of newer
  games is.
- Games already in your library are left out, as in every catalogue row.

Files: `parseLatestGames` / `parseTrendingChart` in `src/shared/ankergames.ts`,
`src/main/services/ankergames/home-feed.ts`, `getAnkerGamesFeed` (IPC) and
the two shelves in `catalogue-front-page.tsx`.

## Downloading

AnkerGames' download page needs its Cloudflare "Verify you are human" check
passed, and Electron windows fail it (Turnstile error 600010, with or without
a debugger attached), so the download happens in your own browser. Hydra
opens the page, the browser saves the file, and Hydra takes it from there.

1. **Download now**: Hydra picks the game's main download row (not add-ons
   such as Online Fix) and asks `/generate-download-url/<id>` for a signed
   download page, as the site's own button does (as a guest; the ticket is
   tied to your IP, not to Hydra). A refusal ends here with a message: limit
   reached, subscribers only, or not offered in your region.
2. The page opens in your default browser and a toast says to continue there.
   The site runs its wait (five seconds for guests) and its check, then the
   browser downloads the archive (`<Game>-AnkerGames.zip`) by itself.
3. Meanwhile the download shows in Hydra's Downloads page.
   `AnkerGamesBrowserDownload` stands in for the HTTP downloader: once a
   second it looks in the browser downloads folder for this game's archive
   (matched by name against the slug) and reports the in-progress file's size
   (`.part` for Firefox/Zen, `.crdownload` for Chromium) against the size from
   the game page.
4. When the browser has finished (no in-progress file, size unchanged across
   two checks), Hydra moves the archive into the game's download folder and
   reports the download complete. Extraction, archive cleanup and game setup
   then run as for any other download.

Details:

- If this game's archive is already in the folder, or the browser is still
  saving it, **Download now** does not open the page again.
- An archive older than AnkerGames' last update of the game (`dateModified`)
  is an old version and is ignored.
- Pausing or cancelling in Hydra only stops the watch; the browser's download
  is its own. Resuming with nothing in the folder opens the page again.
- With nothing appearing for 30 minutes, the download stops with an error
  pointing at the folder setting.
- Hydra's usual link check before a download starts is skipped for
  AnkerGames (there is no link; the game page would answer 403).
- Big Picture leaves AnkerGames releases out for now; it has no notice for
  the browser step.

**Browser downloads folder** in the AnkerGames settings is the folder Hydra
watches. It defaults to the system Downloads folder (XDG).

Files: `src/shared/ankergames.ts` (URIs, sitemap, page and home-feed parsing,
archive matching), `src/main/services/ankergames/` (catalogue, download page,
browser-download watcher), `start-game-download.ts`,
`DownloadManager.getAnkerGamesDownloadOptions`, `settings-ankergames.tsx`,
`ankergames-browser-notice.tsx`.

Requests to ankergames.net go through the session source verification uses
(`persist:download-source-verification`, Chrome user agent, no permissions,
no downloads); see [local source matching](local-source-matching.md#verify-in-browser).

## Later

The Hydra Plus browser add-on could notice the AnkerGames download, cancel it
in the browser and hand the link to Hydra, so Hydra downloads the file itself
(pause, resume, speed limits). The link works without cookies and supports
ranges. The folder watch stays as the fallback without the add-on.
