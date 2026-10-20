# Hydra Plus roadmap

What we plan to add or fix. Shipped features are documented in
`docs/features/`; move an item there (and out of this file) when it ships.

## Order

Work top to bottom. Each phase is roughly one release; the items are described
in the sections below.

1. **Updates.** Finish the install → update loop. Shipped:
   [Game updates](features/updates.md), backups in
   [Save import](features/save-import.md#backups).
   1. [x] Store the installed version
   2. [x] Better version stripping
   3. [x] Update detection
   4. [x] Update a game in place
   5. [x] Backup cleanup, with backup sizes
2. **Setup you can see and fix.** Shipped: setup log and per-step re-runs in
   [Game setup](features/game-setup.md#setup-log), the per-game switch in
   [OnlineFix](features/online-fix.md), the preview in
   [Launch rules](features/launch-rules.md#launch-command-preview).
   1. [x] Per-game OnlineFix switch
   2. [x] Setup log per game
   3. [x] Run a setup step again
   4. [x] Launch command preview
3. **Proton and launch options.** Shipped:
   [Proton builds and launch tools](features/proton-and-launch-tools.md)
   (built-in MangoHud editor chosen over GOverlay; the upscaler line covers
   OptiScaler games), per-game OptiScaler versions in
   [OptiScaler](features/optiscaler.md).
   1. [x] Proton manager
   2. [x] Proton version in launch rules
   3. [x] GOverlay vs a built-in MangoHud editor (decision)
   4. [x] GameMode and MangoHud settings
   5. [x] Gamescope as a launch-rule action
   6. [x] Upscaler and frame-gen indicator
   7. [x] OptiScaler per game
   8. [x] Prefix tools
4. **Small fixes.** Cheap items batched into one release. Shipped:
   [Game page and interface](features/game-page.md), ignored and skipped
   folders in [Library scanning](features/library-scanning.md), free space
   and Steam links in [Downloads](features/downloads.md).
   1. [x] One name for the options dialog
   2. [x] Move pin and favourite
   3. [x] Open elsewhere
   4. [x] Ignore a folder
   5. [x] Explain skipped folders
   6. [x] Mark missing games
   7. [x] Check free space
   8. [x] Paste a Steam link
   9. [x] Middle-click autoscroll
5. **Launch tool conflicts.** Outside wrappers that manage the same game
   folder as Hydra. Shipped: the launch check and wrapper warnings in
   [OptiScaler](features/optiscaler.md#files-removed-outside-hydra),
   [launcher redirects](features/proton-and-launch-tools.md#launcher-redirects).
   vkBasalt and lsfg-vk moved to "Not scheduled yet" (not used, 2026-10-19).
   1. [x] Check OptiScaler files at launch
   2. [x] Warn about wrappers that manage OptiScaler
   3. [x] Launcher redirects
6. **Fixes from other forks.** Bugs other forks fixed that are confirmed on
   our code ([fork survey](fork-survey.md)), plus cheap improvements.
   Shipped: [Steam shortcuts](features/proton-and-launch-tools.md#steam-shortcuts),
   [`hydralauncher://` links](features/browser-addon.md#hydralauncher-links),
   [cancelling downloads](features/downloads.md#cancelling), the rest in
   [Game page and interface](features/game-page.md#fixes).
   1. [x] Add to Steam keeps Hydra's prefix
   2. [x] Hydra links reach Hydra Plus
   3. [x] Library refreshes after a playtime change
   4. [x] Catalogue survives failed requests
   5. [x] Achievements without metadata
   6. [x] Cap achievement bursts
   7. [x] Pause videos while hidden
   8. [x] Gamescope follows the display
   9. [x] Keep files when cancelling
   10. [x] Open the window sooner (measure first)
7. **Library.** Shipped: [Library](features/library.md), automatic rescans
   in [Library scanning](features/library-scanning.md#rescan-automatically),
   details, genres and artwork in [Game page](features/game-page.md#details).
   1. [x] Play status
   2. [x] Genres
   3. [x] Source tabs
   4. [x] Sorting
   5. [x] Library filters (OpenCritic dropped: the API has no source for
          it; Metacritic comes from Steam's store data)
   6. [x] Rescan automatically
   7. [x] Collections
   8. [x] Download state on cards
   9. [x] Hide duplicates
   10. [x] Edit metadata
8. **Home page.**
   1. [ ] Redesign around your own games
   2. [ ] Play heatmap and streaks
   3. [ ] Personalised suggestions (research first)
9. **More save sources.**
   1. [ ] Heroic and Lutris
   2. [ ] Ludusavi backups
   3. [ ] Steam's own prefixes
   4. [ ] Steam Cloud
   5. [ ] Hydra cloud account
10. **Distribution.**
    1. [ ] Export and import settings
    2. [ ] pacman updates
    3. [ ] Sign the browser add-on
    4. [ ] Translations
11. **Mods.** Native mod support, after a design.

Why this order:

- Updates come first: they were already next, and in-place updates need the
  stored version and create backups, so those items ship together.
- Phases 2–3 build on each other: the setup log is what "run again" and the
  launch preview hang off, and the preview is the debugging tool for every
  launch-rule action in phase 3. Pick the Proton build before rules can use it.
- Small fixes go before the library work so they don't wait behind it.
- Launch tool conflicts come next because they break games that already work:
  GOverlay's `bgmod` wrapper silently deleted Hydra's OptiScaler files
  (2026-10-18). The integrity check is cheap and catches any future cause.
- Fixes from other forks are bugs that already bite (Add to Steam swapping
  the prefix loses a game's setup and saves), so they go before new features.
- Play status leads the library phase because filters, sorting and the home
  page's "Clear your backlog" all read it. The home redesign needs the library
  data, so it follows.
- Save sources are independent of everything else; Heroic/Lutris and
  Ludusavi are cheap, Steam Cloud needs a Steam login, Hydra cloud waits on
  the account existing.
- Settings export makes the postponed laptop install a one-step job.
  Translations go last, once the settings pages stop changing.
- Mods are the largest item and need a design before any of it is built.

## Not scheduled yet

From the [fork survey](fork-survey.md); each needs a decision on whether
it's wanted.

- [ ] **Storage page.** Disk use per game, with a breakdown bar, and freeing
      space from there.
- [ ] **FSR4 DLLs for OptiScaler.** Download FSR4 override DLLs for GPUs
      without native FSR4 (RDNA3, integrated graphics). Not needed on RDNA4.
- [ ] **Anti-cheat scan for OptiScaler.** Look for anti-cheat files in the
      game folder, on top of the compatibility list.
- [ ] **Installer detection.** Offer to run a `setup`/`install` exe found in
      a finished download. Compare with the exe guess after extraction
      first.
- [ ] **`--no-tray`.** Quit when the window closes.
- [ ] **vkBasalt and lsfg-vk.** Per-game toggles written like the MangoHud
      layout (`ENABLE_VKBASALT=1` plus a config path; lsfg-vk's profile or
      environment). Not used as of 2026-10-19. vkBasalt is only installed
      inside `proton-cachyos-slr`; lsfg-vk is installed as a user layer.

## Launch tool conflicts

Found 2026-10-18: GOverlay's `bgmod` wrapper (v1.9.4, in
`~/.local/share/goverlay/gameconfig/global/`) was in Hellraiser Revival's
launch command. With `GOVERLAY_OPTISCALER=0` it treats any OptiScaler files as
its own leftovers and deletes them on every launch: `OptiScaler.ini`,
`OptiScaler/` and `plugins/OptiPatcher.asi`. It keeps `dxgi.dll` because it
counts that as a third-party proxy DLL. OptiScaler then runs with defaults
(menu on Insert, not the configured F9). `PRESERVE_INI` and the undocumented
`OPT_UNMANAGED_INI` only apply when bgmod manages OptiScaler itself; no
setting turns the cleanup off. `bgmod` also exports its own
`MANGOHUD_CONFIGFILE`, which overrides Hydra's per-game layout.

Rule going forward: a tool that only writes config files Hydra points at is
fine to use. Anything that copies files into game folders, wraps the
executable or exports launch environment belongs to Hydra. With launcher
redirects shipped, nothing in use still needs `bgmod`.

## Home page

- [ ] **Redesign around your own games.** The hero shows the last game played
      instead of the current hot game. Below it come "Continue playing" (last
      few played) and "Clear your backlog" (installed games never played, or
      not in a long time). "Hot now", "Top games of the week" and "Games to
      beat" move further down. References: abrahampo1's cover-art home and
      atxoxx's activity page ([fork survey](fork-survey.md)).
- [ ] **Play heatmap and streaks.** Record play per day; show a 13-week
      heatmap and a streak badge (abrahampo1, GameOneDev).
- [ ] **Personalised suggestions.** Suggest what to play next from what you
      played. Ideally through a Backloggd integration (what the user uses) and
      similar services, falling back to Hydra's own play history. Needs
      research: Backloggd has no public API, and a free recommendations API
      still has to be found.

## Mods

- [ ] **Native mod support.** A mod manager inside Hydra, along the lines of
      Amethyst Mod Manager or another open-source one, ideally as smooth as
      Prism Launcher but for every game. Sources: Nexus Mods, Wabbajack lists,
      and the other popular mod sites. TorBox integration to get around Nexus
      Mods' slow free downloads. Large; needs a design first.

## Save import, later sources

All of these plug into the `SaveImportSource` interface.

- [x] **Upstream Hydra Launcher.** Reads each game's prefix from
      `~/.config/hydralauncher`, so switching to Hydra Plus keeps saves.
- [ ] **Heroic and Lutris.** Read their per-game prefixes, the same way as
      the upstream Hydra source.
- [ ] **Ludusavi backups.** Import from a Ludusavi backup folder.
- [ ] **Steam Cloud.** Download cloud saves for every owned game, installed or
      not. Needs a Steam login inside Hydra.
- [ ] **Hydra cloud account.** Import from it once it exists.
- [ ] **Steam's own prefixes.** Write imports into Steam's per-game prefixes
      for games played through Steam.

## Distribution and upkeep

- [ ] **Export and import settings.** Launch rules, library folders and
      defaults in one file, for setting up another machine.
- [ ] **pacman updates.** The in-app updater only updates the AppImage. Add a
      `hydra-plus-bin` AUR package or a small pacman repo.
- [ ] **Translations.** The Hydra Plus settings are English-only; other
      languages fall back to English.
- [ ] **Sign the browser add-on** for Firefox Add-ons, and the Chrome Web
      Store if wanted.

## Postponed

- Built-in download sources, and why the laptop gets different server source
  ids for the same URL.
- Self-hosted cloud saves on Cloudflare. CappyT's local and rclone backup
  stores, per-device conflict detection and restore-on-first-launch are a
  reference ([fork survey](fork-survey.md)).
- Installing on the laptop (offline in Tailscale). Leave the HDR rule off
  there.

## Known problems

- Broken sources: the Rutracker source URL returns 404; onlinefix sits behind
  a Cloudflare challenge.
- `tsc` reports TS7056 on `src/locales/index.ts` (the inferred translation
  type is too large). It predates the fork's changes.

## Declined

- Built-in LinUwUx/Denuvo detection. A launch rule can do it.
- LuaTools, SteamTools, SteaMidra or ACCELA as a download source.
