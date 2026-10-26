# AnkerGames and download source reliability: plan

Written 2026-10-26. Starts from one report: Chants of Sennaar is on
ankergames.net, but Hydra Plus lists no AnkerGames download for it even though
the AnkerGames source is added.

## Findings

### Why the download was missing

- The AnkerGames source is `https://wkeynhk.online/ankergames.json` (ID
  `VjxXKG7j`), a third-party scrape of ankergames.net. The site doesn't
  publish it.
- The live file has 1216 entries and none is Chants of Sennaar. Hydra Plus's
  local copy matches it and was synced the same day, so neither the server
  matching nor the local matcher ([local source matching](features/local-source-matching.md))
  dropped anything. The source is incomplete.
- Four other sources (`J5n0xnrE`, `BVnaGLvo`, `qygRqnVJ`, `9nG89Zyg`) fail local
  sync with "Blocked by a Cloudflare challenge", and `penJq2jl` returns
  HTTP 404. None is AnkerGames, but they have no local copy, so they only match
  through Hydra's server.

### What ankergames.net exposes

- Home page, game pages and sitemaps are server-rendered and load without a
  login or challenge for a browser-like client. Plain `curl` was challenged on
  `robots.txt` once, so fetch from Electron's network stack.
- The home page has 16 Trending and 16 Latest cards. Each card has the game
  URL (`uiPostCard('…/game/<slug>')`), title, version and poster.
- `sitemap.xml` indexes post, genre, collection, article and company sitemaps.
- `/api/game/<id>/credits` returns an HTML snippet of the game's notes. It is
  no use for the catalogue.
- `robots.txt` allows all of the above. It disallows `/download/`, `/torrent/`,
  `/torrent-file/`, `/search/`, `/livewire/`, `/login` and a few account paths.
- Game pages contain no download links. Links come from a modal that the site
  meters ("Download Limit Reached", "Subscribers Only", "Verified players
  only"), with the torrent option behind a paid tier.

### Cloudflare solvers

All of this comes from READMEs and blog posts; none was verified here.

- **FlareSolverr** v3.4.6 (Nov 2025) is the latest release. It reportedly still
  passes light JavaScript challenges but struggles with Turnstile and managed
  challenges.
- **Solvearr** (`nabil-ak/Solvearr`) was archived in May 2025. It imitates a
  browser's TLS fingerprint without running a browser, so it is the weakest
  option against current challenges.
- **Byparr** is a FlareSolverr-compatible replacement built on Camoufox, and
  it is still maintained.

## Decisions

- **No AnkerGames link extraction.** Their download modal enforces limits and a
  subscription gate, and `/download/` is disallowed in robots.txt. A per-game
  on-demand request would not strain their servers, but it would bypass
  those limits. Hydra Plus links to the game's page instead and the person
  downloads under their own account.
- **No automatic challenge solving built in.** Hydra Plus does not solve
  challenges itself. A person passes them in a window. A self-hosted solver
  stays an opt-in extra, see phase 4.
- **Public pages only, cached and rate-limited.** Everything below reads pages
  anyone can open, caches the result and never loops over the site.

## Phases

### 1. Verify in browser (done, untested end to end)

Built on 2026-10-26, uncommitted. Typechecks, lints, and the user-agent unit
test passes. Not yet run in the app against a real challenge.

- A failed source row shows **Verify in browser** when the failure is a
  Cloudflare challenge. It opens the source in a window; once `cf_clearance`
  arrives the window closes and the source is downloaded again.
- The cookie lives in a persistent session,
  `persist:download-source-verification`. Source refreshes go through that
  session, which sends Chrome's user agent without the Electron and app tokens
  (the cookie is bound to the user agent).
- Window: HTTPS only, no popups, no permissions, no downloads.
- Files: `src/main/services/local-sources/{browser-user-agent,source-session,source-verification}.ts`,
  `LocalSources.verify`, the `verifyLocalSource` IPC call, the settings row and
  its locale strings, and a section in
  [local source matching](features/local-source-matching.md#verify-in-browser).

To do: run it against a source that is blocked right now, and check the cookie
survives a restart. Confirm the status line clears afterwards.

### 2. AnkerGames page link on game pages

When a game has no AnkerGames release in any source, check its public page and
show "AnkerGames has this game (v1.0.0.9)", linking to the page.

- Slug: derived from the store title, then confirmed against the sitemap. A
  wrong slug returns 404, which means "not on AnkerGames".
- Fetch: one request when a game page opens, through the source session.
  Cache the result on disk for a day, including misses.
- Show the version from the page title, nothing else. No scraping of the
  download modal.
- Setting: **Check AnkerGames for games your sources are missing**, on by
  default. Strings go through i18n as usual.

### 3. Missing-games report

Compare the AnkerGames sitemap with the titles in the AnkerGames source and
list what the source lacks.

- Reuse `sourceMatchKey` for the title comparison.
- Show it in **Settings → Download sources** under the AnkerGames row, with a
  copy button for sending the list to the maintainer.
- Run on demand, and after a source sync if the sitemap copy is older than a
  day. The sitemap copy is the only full-site fetch, once a day.

### 4. Discover rows on the catalogue page

Two rows, "Trending on AnkerGames" and "Latest on AnkerGames", from the home
page.

- A main-process service fetches `https://ankergames.net/` about once a day
  and on a manual refresh, and parses the two sections.
- Match each title to a store game with `sourceMatchKey` against the catalogue.
  Unmatched titles appear as plain cards linking to the AnkerGames page, or are
  dropped; decide when building.
- Cache the parsed list in `<userData>/`. Show the last good list when a fetch
  fails, and the fetch time.
- Markup is a Tailwind/Livewire page, so the parser can break on a redesign.
  Fail quietly (hide the rows, log a warning) and cover the parser with a test
  built from a saved home page.
- Setting to hide the rows. Add the feature to `docs/features/catalogue.md`.

### 5. Optional: self-hosted solver URL

Only if Verify in browser proves too much work. An optional setting holds the
URL of a solver you run yourself, such as Byparr at `http://localhost:8191/v1`.
Hydra falls back to it after a challenge failure and keeps the returned cookie
in the source session. It costs an extra Docker container, and success varies
by site.

## Order and open questions

Order: finish phase 1's end-to-end check, then 2 and 3 together (both read the
sitemap), then 4. Phase 5 waits on how phase 1 behaves.

- Phase 4: show unmatched titles or drop them?
- Phase 2: also look up AnkerGames when a source has the game but an older
  version? That is the update-detection case and would reuse the same
  lookup.
- Is any of the four blocked sources another AnkerGames mirror? If so, phase 1
  may already close the gap.

`docs/roadmap.md` has uncommitted edits, so these phases are not added to it
yet. Add them there when you commit that file.
