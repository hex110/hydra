# Hydra Plus

Fork of Hydra Launcher: GitHub `hex110/hydra`, `main` = fork features on top of
upstream. It is a **separate app** from upstream Hydra — app id
`io.github.hex110.hydraplus`, user data `~/.config/hydra-plus/`, installed to
`/opt/Hydra Plus`. Never touch upstream's `~/.config/hydralauncher/` while testing.

Feature docs live in `docs/features/` — keep them in step with the code.

Upstream's coding rules (logger not console, i18n for every user-facing string,
named exports, …):

@.cursorrules

## UI consistency

The UI is being reworked page by page. These rules keep it one app, not a
collection of cards. The game page is the reference; check new work against it.

- **One home per fact.** Before adding UI, find the fact's row in the ownership
  table in `docs/features/game-page.md`. A fact is shown in one place; a second
  place (a summary elsewhere) must link to the first, not repeat it. A new fact
  gets a row in the same change.
- **Build from `src/renderer/src/components/`.** Right-hand sidebar content is a
  `SidebarSection`. No native `<select>`, checkbox or other form control, and no
  new card or section chrome in a feature folder. If a primitive is missing
  (e.g. an interactive rating), add it to `components/` first, then use it.
- **No raw colours or sizes in feature SCSS.** No hex or `rgba()` literals
  except inside `globals.scss`; repeated values become tokens there. Use
  `$spacing-unit` multiples and the font-size tokens.
- **Animation:** use `opacity` and `transform` only, and gate it behind
  `prefers-reduced-motion`. Don't animate inside `backdrop-filter` or
  `overflow: hidden` panels with anything that can leave stale paint on Linux.
- **Before you finish a UI change**, ask: where does this live, does the fact
  already appear elsewhere, is there an empty and a loading state, is the text
  translated.
- **Verify visually.** Run the sandboxed dev instance (see Dev testing) and look
  at the page, at a narrow and a wide window.

## Release

Bump `package.json` to `X.Y.Z-plus.N`, push tag `vX.Y.Z-plus.N`;
`.github/workflows/plus-release.yml` builds the AppImage + `.pacman` and
publishes. The updater runs with `allowPrerelease = false`, which is what lets
`-plus.N` versions update normally.

## Local build

Needs `binaries/epic-prerequisite-runner/x64/`, which can't be built here (no
Windows Rust target / mingw). Copying `/opt/Hydra/resources/epic/*` from an
upstream install works as long as the runner source is unchanged.

Build with the production env vars from `plus-release.yml`. `/tmp` is a RAM
tmpfs, and fpm's `.pacman` staging overflows it (ENOSPC); set `TMPDIR` to a
folder on disk, e.g. `--linux pacman --prepackaged dist/linux-unpacked`.
Don't run a sandboxed dev instance from `/tmp` and scan real library folders:
game setup fills the sandbox with Wine prefixes (24 GB once).

## Dev testing

- Run sandboxed: `MAIN_VITE_USER_DATA_PATH=<sandbox> npx electron-vite dev --remoteDebuggingPort 9333`.
- Main process and preload are **not** hot-reloaded. Kill the
  `electron . --remote-debugging-port=9333` process and relaunch — the
  single-instance lock keeps stale instances alive.
- Killing instances: Hydra ignores SIGTERM (tray), so use explicit PIDs and
  `kill -KILL`. Never `pkill -f` a pattern that appears in your own command
  line (it kills the tool shell, exit 144); find them with a bracketed first
  letter, e.g. `pgrep -f "[e]lectron-vite dev"`.
- Hydra API array params need `downloadSourceIds[]=` encoding when testing with curl.
- A sandbox seeded with a copy of `hydra-db` inherits the sign-in and
  `scanLibraryOnStartup`: on start it scans the real library folders, creates
  prefixes and posts added games to the user's Hydra profile. Delete the
  `auth`/`user` keys and turn `scanLibraryOnStartup` off in the copy first.
- Point `HOME` at a scratch folder when testing the Proton manager; it
  installs into `~/.local/share/Steam/compatibilitytools.d`.
- A dev build writes app-launcher `.desktop` entries only when
  `HYDRA_PLUS_APPLICATIONS_DIR` is set; point it at a scratch folder.

## Code pitfalls

- Save import (`src/main/services/save-import/`) reuses the cloud-save restore
  code. `resolveRestoreManifestTargets` throws when signed out unless you pass
  empty custom-path bindings, and `mergeAchievements` throws
  `UserNotLoggedInError` when signed out (files are copied anyway). Steam
  `<root>/userdata/` saves are deliberately skipped.
- New save sources go behind the `SaveImportSource` interface.
