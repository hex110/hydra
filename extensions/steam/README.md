# Hydra Plus add-on

A browser add-on that puts Hydra Plus buttons on game pages: in the top right
of Steam store pages, next to **Community Hub**, and under the game's title on
the sites below.

| Site                                                             | Finds the game by                           |
| ---------------------------------------------------------------- | ------------------------------------------- |
| Steam store, SteamDB, ProtonDB                                   | Steam app id in the URL                     |
| PCGamingWiki                                                     | Steam app id in its infobox, else the title |
| Backloggd, OpenCritic, Metacritic, IsThereAnyDeal, HowLongToBeat | Title, matched to a Steam game by the app   |

The buttons:

- An icon shows whether the game is not in your library, in it, or downloaded.
  It asks the running app, so it needs Hydra Plus open.
- **Download** opens the game in Hydra Plus with the best download marked. It
  is hidden once the game is downloaded. See
  [Browser add-on](../../docs/features/browser-addon.md).
- **Open in Hydra Plus** opens the game's page, whatever the status.

It works in Firefox 115+ and Chromium-based browsers. It only runs on the
sites above, only talks to Hydra Plus on your own computer (`127.0.0.1`), and
collects no data. The add-on keeps the id `hydra-plus-steam@hex110.github.io`
and the `hydra-plus-steam-*` file names from when it was Steam-only, so
existing installs keep updating.

## Install

- **Firefox, Zen:** download `hydra-plus-steam-<version>.xpi` from the
  [latest release](https://github.com/hex110/hydra/releases/latest) and open
  it. It is signed by Mozilla (unlisted, not on the add-on site), so it stays
  installed, and it updates itself from `extensions/signed/updates.json` in
  this repository.
- **Chrome, Edge, Brave:** download `hydra-plus-steam-addon-<version>.zip`,
  unzip it, open `chrome://extensions`, turn on **Developer mode**, choose
  **Load unpacked** and pick the folder. Chromium browsers do not update it.

## Develop

The add-on is plain JavaScript with no build step.

```sh
npx web-ext lint --source-dir extensions/steam    # validate for Firefox
npx web-ext run --source-dir extensions/steam     # try it in a fresh Firefox profile
```

Strings live in `_locales/<language>/messages.json`. `content.js` has one entry
per site in `SITES`: how to read the game from the page and where to put the
box. `npm test` covers it (`scripts/addon-content.test.mjs`), against
trimmed-down copies of each site's markup.

To add a site: add its host to `content_scripts.matches` in `manifest.json`
(the whole host, since most of these sites change pages without reloading) and
a `SITES` entry, then a test.

## Release a new version

Mozilla signs each version once, so every change to the add-on needs a new
`version` in `manifest.json`.

```sh
export WEB_EXT_API_KEY=<JWT issuer> WEB_EXT_API_SECRET=<JWT secret>   # from addons.mozilla.org/developers/addon/api/key/
npx web-ext sign --source-dir extensions/steam --artifacts-dir dist \
  --channel=unlisted --ignore-files .eslintrc.cjs README.md
cp dist/*-<version>.xpi extensions/signed/hydra-plus-steam-<version>.xpi
```

Then add the version to `extensions/signed/updates.json` (point `update_link`
at the new file on `main`), commit, and push. Browsers pick the update up from
`main`, and the release workflow attaches the xpi for the manifest's version,
so push the commit before tagging.
