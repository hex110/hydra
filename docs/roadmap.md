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
   [OptiScaler](features/optiscaler.md#files-removed-outside-hydra).
   1. [x] Check OptiScaler files at launch
   2. [x] Warn about wrappers that manage OptiScaler
   3. [ ] vkBasalt and lsfg-vk (only if wanted)
   4. [ ] Launcher redirects
6. **Fixes from other forks.** Bugs other forks fixed that are confirmed on
   our code ([fork survey](fork-survey.md)), plus cheap improvements.
   Shipped: [Steam shortcuts](features/proton-and-launch-tools.md#steam-shortcuts).
   1. [x] Add to Steam keeps Hydra's prefix
   2. [ ] Sign-in returns reach Hydra Plus
   3. [ ] Library refreshes after a playtime change
   4. [ ] Catalogue survives failed requests
   5. [ ] Achievements without metadata
   6. [ ] Cap achievement bursts
   7. [ ] Pause videos while hidden
   8. [ ] Gamescope follows the display
   9. [ ] Keep files when cancelling
   10. [ ] Open the window sooner (measure first)
7. **Library.**
   1. [ ] Play status
   2. [ ] Genres
   3. [ ] Source tabs
   4. [ ] Sorting
   5. [ ] Library filters
   6. [ ] Rescan automatically
   7. [ ] Collections
   8. [ ] Download state on cards
   9. [ ] Hide duplicates
   10. [ ] Edit metadata
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

## Fixes from other forks

Found in other forks and confirmed on our code, 2026-10-19. The
[fork survey](fork-survey.md) has the fork commit for each and what it
changes.

- [ ] **Sign-in returns reach Hydra Plus.** With upstream Hydra installed,
      `hydralauncher://` links open upstream. Use `hydraplus://` for the
      Steam sign-in return; find a fix for the Hydra account's
      `hydralauncher://auth`, which Hydra's website sends.
- [ ] **Library refreshes after a playtime change.** Changing or resetting
      playtime only refreshes the game page.
- [ ] **Catalogue survives failed requests.** A failed search leaves the
      skeleton up forever; the filter metadata fetches have no error
      handling.
- [ ] **Achievements without metadata.** Unlocks missing from the catalogue
      get no notification; show the raw name instead.
- [ ] **Cap achievement bursts.** While signed out, or right after turning on
      Steam achievements, a game's whole unlock history can play as new
      popups. Treat the first read as the baseline, and collapse more than
      ten at once into one notification.
- [ ] **Pause videos while hidden.** Game page videos fast-forward to catch
      up after the window was minimised.
- [ ] **Gamescope follows the display.** Fill in output size and refresh
      rate from the current display when the action leaves them empty
      (gamescope otherwise runs nested at 60 Hz), and skip gamescope inside
      a gamescope session.
- [ ] **Keep files when cancelling.** Cancelling or removing a download
      always deletes what was downloaded; offer to keep it.
- [ ] **Open the window sooner.** Startup waits for the Hydra API setup and
      Epic init before showing a window. Measure how long that takes
      offline before changing anything.

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
executable or exports launch environment belongs to Hydra.

- [ ] **vkBasalt and lsfg-vk.** Only if they get used: per-game toggles
      written like the MangoHud layout (`ENABLE_VKBASALT=1` plus a config
      path; lsfg-vk's environment). Replaces the remaining reason to keep
      `bgmod`.
- [ ] **Launcher redirects.** A table that maps a launcher exe to the real
      game exe (Cyberpunk's `REDprelauncher.exe` → `bin/x64/Cyberpunk2077.exe`
      and similar). `bgmod`'s `[Launchers]` section is a starting list; `bgmod`
      is MIT, so it can be reused. GOverlay itself is GPL-3.0, so borrow ideas
      from it, not code.

## Library scanning

- [ ] **Rescan automatically.** Watch library folders and pick up changes
      without a manual scan.

## Library

- [ ] **Play status.** Playing, finished, dropped, backlog. Filters, sorting
      and the home page's "Clear your backlog" read it; Backloggd suggestions
      would too.
- [ ] **Genres.** Show a game's genres on its page, and filter the library by
      genre. The most wanted item in this section.
- [ ] **Source tabs.** Replace the `All / PC / Classics` buttons with
      `All / Local / Steam / Epic / Classics`, so local and Steam games can be
      told apart without a hand-kept collection. Upstream now has a
      Hydra / Steam / Epic source dropdown; build on that.
- [ ] **Library filters.** Upstream's library has installed, source, platform
      and collection filters. Add genre, play status, ProtonDB tier
      (the catalogue has this filter already), installed size, How Long to
      Beat ranges (under 2 h, 2–6 h, 6–15 h, …), OpenCritic/Metacritic score
      ranges, and the other usual ones.
- [ ] **Sorting.** The sort options a game library is expected to have (name,
      last played, play time, added, release date, score, installed size, …).
      Upstream has name (both ways), recently played, most played,
      achievements and installed first.
- [ ] **Collections.** A better way to manage them. Low priority.
- [ ] **Download state on cards.** Show downloading, extracting and setup
      progress on library cards (abrahampo1).
- [ ] **Hide duplicates.** One entry per title when a game is in the library
      twice, preferring the Steam copy, then the one with more playtime
      (chimaera).
- [ ] **Edit metadata.** Edit a game's title, description and images, with a
      language choice for the metadata search, and search every artwork
      provider at once (atxoxx).

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
