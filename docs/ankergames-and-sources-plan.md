# AnkerGames as Hydra Plus's main source: plan

Written 2026-10-26, revised 2026-10-28. Starts from one report: Chants of
Sennaar is on ankergames.net, but Hydra Plus listed no AnkerGames download for
it even though the AnkerGames source was added.

## Findings

- The AnkerGames source people add is `https://wkeynhk.online/ankergames.json`
  (ID `VjxXKG7j`), a third-party scrape. It had 1221 entries on 2026-10-28;
  the site's sitemaps list 2146 games. Chants of Sennaar was missing from it.
  1192 of its links are Datanodes, 29 Gofile, 3 PixelDrain.
- ankergames.net serves its home page, game pages and sitemaps to a
  browser-like client without a challenge. robots.txt allows them and
  disallows `/download/`, `/torrent/`, `/livewire/`, `/login` and account
  paths.
- Game pages carry JSON-LD `VideoGame` data (name, `softwareVersion`,
  `fileSize`, `dateModified`) and a download modal whose rows call
  `generateDownloadUrl(<id>)`. Rows are labelled "Direct" or "Download" for
  the game and "Online Fix" for an add-on.
- The site's download flow:
  1. `POST /generate-download-url/<id>` with a CSRF token from
     `/csrf-token` returns a signed `/download/<ticket>` link bound to the
     visitor's IP. It works for guests; refusals carry `show_upgrade`
     (limit), `geo_blocked` or `modal_type: "subscribe"`.
  2. The download page runs a per-tier wait (5 s for guests) and a Cloudflare
     Turnstile check. In Electron the check asked for a click ("Verify you
     are human").
  3. With the token, the page navigates to `/download-file/<hash>`, which
     hands over a signed direct file link (seen 2026-10-28:
     `https://tunnel5.dlproxy.uk/download/<token>?sig=…`, serving
     `Chants-of-Sennaar-AnkerGames.zip`). The link works without cookies and
     supports ranges; Cloudflare there answers Node's default user agent with 403.
- **Electron fails the check.** Turnstile error 600010 in a Hydra window and in
  a bare Electron window without a debugger; Zen passes it.
- The old third-party source skips all of this: its links point straight at
  Datanodes, which Hydra's server unlocks.

## Decisions

- **Hydra builds the list itself** from the sitemaps and game pages. No
  third-party JSON.
- **The download happens in the person's browser.** Download opens
  AnkerGames' download page there; the site's wait, check and limits apply as
  usual. Hydra picks the archive up from the browser's downloads folder.
  Nothing harvests links in bulk, stores them or works around the limits.
- **No automatic challenge solving.** The person passes the check.

## Done (2026-10-28, branch `feat/ankergames-source`)

See [AnkerGames](features/ankergames.md). Catalogue from the sitemaps,
per-game page details cached for a day, AnkerGames releases first on game
pages and in preselection, the download page opened in the browser, and a
watcher on the browser downloads folder that hands the archive to Hydra's
normal extraction and setup.

Verified in a sandboxed dev build: 2146 games read; Chants of Sennaar shows
"Chants of Sennaar – V 1.0.0.9, 0.52 GB, AnkerGames"; a finished archive is
picked up within a second, moved, extracted (634 files) and set up; a growing
`.part` shows as progress and completes when renamed. The browser step itself
was passed by hand in Zen, outside Hydra.

## Still open

- **Browser add-on hand-off.** Extend `extensions/steam` to notice the
  AnkerGames download (`downloads` permission), cancel it in the browser and
  send the link to Hydra over the local bridge, so Hydra downloads it with
  pause, resume and speed limits. Waits until the uncommitted add-on 1.2.0
  work in the main checkout is committed; needs a Mozilla re-sign.
- **A real run from Hydra to Zen.** Opening the page from Hydra and letting Zen
  save into `~/Downloads` has not been run in one go yet.
- **Verify in browser** (2026-10-26) still needs its end-to-end check against
  a blocked source; the Electron fingerprint finding above suggests it may
  fail for Turnstile-protected sources too.
- Later: showing an AnkerGames version newer than the installed one as an
  update.

"Trending / New on AnkerGames" rows on the catalogue page are done (2026-10-28);
see [AnkerGames](features/ankergames.md#catalogue-rows).
