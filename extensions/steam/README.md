# Hydra Plus for Steam

A browser add-on that adds a **Hydra Plus** box to Steam store pages, with two
buttons:

- **Download** opens the game in Hydra Plus with the best download already
  chosen, or starts it straight away. See
  [Browser add-on](../../docs/features/browser-addon.md).
- **Open in Hydra Plus** opens the game's page.

It works in Firefox 115+ and Chromium-based browsers. It only runs on
`store.steampowered.com/app/*` pages, needs no permissions beyond storing its
own option, and collects no data.

## Install (unsigned builds)

Download `hydra-plus-steam-addon-<version>.zip` from the
[latest release](https://github.com/hex110/hydra/releases/latest).

- **Firefox:** open `about:debugging#/runtime/this-firefox`, choose **Load
  Temporary Add-on…** and pick the zip. Temporary add-ons are removed when
  Firefox restarts until the add-on is signed by Mozilla.
- **Chrome, Edge, Brave:** unzip it, open `chrome://extensions`, turn on
  **Developer mode**, choose **Load unpacked** and pick the folder.

## Develop

The add-on is plain JavaScript with no build step.

```sh
npx web-ext lint --source-dir extensions/steam    # validate for Firefox
npx web-ext run --source-dir extensions/steam     # try it in a fresh Firefox profile
```

Strings live in `_locales/<language>/messages.json`.
