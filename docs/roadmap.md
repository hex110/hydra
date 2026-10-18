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
3. **Proton and launch options.**
   1. [ ] Proton manager
   2. [ ] Proton version in launch rules
   3. [ ] GOverlay vs a built-in MangoHud editor (decision)
   4. [ ] GameMode and MangoHud settings
   5. [ ] Gamescope as a launch-rule action
   6. [ ] Upscaler and frame-gen indicator
   7. [ ] OptiScaler per game
   8. [ ] Prefix tools
4. **Small fixes.** Cheap items batched into one release.
   1. [ ] One name for the options dialog
   2. [ ] Move pin and favourite
   3. [ ] Open elsewhere
   4. [ ] Ignore a folder
   5. [ ] Explain skipped folders
   6. [ ] Mark missing games
   7. [ ] Check free space
   8. [ ] Paste a Steam link
   9. [ ] Middle-click autoscroll
5. **Library.**
   1. [ ] Play status
   2. [ ] Genres
   3. [ ] Source tabs
   4. [ ] Sorting
   5. [ ] Library filters
   6. [ ] Rescan automatically
   7. [ ] Collections
6. **Home page.**
   1. [ ] Redesign around your own games
   2. [ ] Personalised suggestions (research first)
7. **More save sources.**
   1. [ ] Heroic and Lutris
   2. [ ] Ludusavi backups
   3. [ ] Steam's own prefixes
   4. [ ] Steam Cloud
   5. [ ] Hydra cloud account
8. **Distribution.**
   1. [ ] Export and import settings
   2. [ ] pacman updates
   3. [ ] Sign the browser add-on
   4. [ ] Translations
9. **Mods.** Native mod support, after a design.

Why this order:

- Updates come first: they were already next, and in-place updates need the
  stored version and create backups, so those items ship together.
- Phases 2–3 build on each other: the setup log is what "run again" and the
  launch preview hang off, and the preview is the debugging tool for every
  launch-rule action in phase 3. Pick the Proton build before rules can use it.
- Small fixes go before the library work so they don't wait behind it.
- Play status leads the library phase because filters, sorting and the home
  page's "Clear your backlog" all read it. The home redesign needs the library
  data, so it follows.
- Save sources are independent of everything else; Heroic/Lutris and
  Ludusavi are cheap, Steam Cloud needs a Steam login, Hydra cloud waits on
  the account existing.
- Settings export makes the postponed laptop install a one-step job.
  Translations go last, once the settings pages stop changing.
- Mods are the largest item and need a design before any of it is built.

## Linux gaming

- [ ] **Proton manager.** Download and update GE-Proton and Proton-CachyOS
      into `compatibilitytools.d`. Upstream's per-game Proton picker only
      lists builds that are already installed.
- [ ] **Proton version in launch rules.** Let a rule pick GE-Proton or
      Proton-CachyOS.
- [ ] **GameMode and MangoHud settings.** Upstream already has per-game and
      global on/off toggles. Missing: a MangoHud config editor (position,
      metrics, FPS limit), per game and as defaults, and both as launch-rule
      actions.
- [ ] **GOverlay vs a built-in MangoHud editor.** Decide whether to launch
      GOverlay or build our own editor before starting the item above.
- [ ] **Gamescope as a launch-rule action.** Resolution, FPS limit and HDR.
- [ ] **Upscaler and frame-gen indicator.** A clear overlay line saying which
      upscaler is active and whether frame generation is on, and which one.
      OptiScaler's overlay shows this, but only for games it is installed in,
      and it is hard to read. Look at what MangoHud can show first.
- [ ] **OptiScaler per game.** Update a game's OptiScaler to a newer version,
      or uninstall it.
- [ ] **Prefix tools.** Upstream has Winetricks and a reset on Proton switch.
      Add winecfg, a plain "reset prefix", and each prefix's size on disk.

## Library scanning

- [ ] **Ignore a folder.** Unrecognised folders such as launchers and mod
      managers (`Prism Launcher`, `r2modman`, `Vortex Mods`) show up after
      every scan. Add "this is not a game" to hide them for good.
- [ ] **Explain skipped folders.** A folder without any `.exe` is skipped
      silently. `~/Downloads/Cult of the lamb` looked like a missed game but
      was an empty folder skeleton; the game itself lives in
      `/mnt/Multimedia/home-offload/Downloads/`. A "skipped: no executable"
      list would have made that obvious.
- [ ] **Mark missing games.** When an installed game's folder is gone, mark
      it missing instead of failing at launch.
- [ ] **Rescan automatically.** Watch library folders and pick up changes
      without a manual scan.

## Downloads

- [ ] **Paste a Steam link.** Paste a store URL in Hydra to open the game and
      start the download choice. The browser add-on already covers this from
      the Steam store page.
- [ ] **Check free space** before downloading and before extracting.

## Library

- [ ] **Play status.** Playing, finished, dropped, backlog. Filters, sorting
      and the home page's "Clear your backlog" read it; Backloggd suggestions
      would too.
- [ ] **Genres.** Show a game's genres on its page, and filter the library by
      genre. The most wanted item in this section.
- [ ] **Source tabs.** Replace the `All / PC / Classics` buttons with
      `All / Local / Steam / Epic / Classics`, so local and Steam games can be
      told apart without a hand-kept collection.
- [ ] **Library filters.** The catalogue already has filters and tags; the
      library has none. Add genre, install source, play status, ProtonDB tier
      (the catalogue has this filter already), installed size, How Long to
      Beat ranges (under 2 h, 2–6 h, 6–15 h, …), OpenCritic/Metacritic score
      ranges, and the other usual ones.
- [ ] **Sorting.** The sort options a game library is expected to have (name,
      last played, play time, added, release date, score, installed size, …).
- [ ] **Collections.** A better way to manage them. Low priority.

## Home page

- [ ] **Redesign around your own games.** The hero shows the last game played
      instead of the current hot game. Below it come "Continue playing" (last
      few played) and "Clear your backlog" (installed games never played, or
      not in a long time). "Hot now", "Top games of the week" and "Games to
      beat" move further down.
- [ ] **Personalised suggestions.** Suggest what to play next from what you
      played. Ideally through a Backloggd integration (what the user uses) and
      similar services, falling back to Hydra's own play history. Needs
      research: Backloggd has no public API, and a free recommendations API
      still has to be found.

## Game page

- [ ] **One name for the options dialog.** The right-click menu (library and
      sidebar) calls it "Properties"; the game page button calls it "Options".
- [ ] **Move pin and favourite.** They are rarely used but sit in the most
      prominent spot on the game page.
- [ ] **Open elsewhere.** Buttons to open the game's Steam page,
      PCGamingWiki page, and similar.

## Interface

- [ ] **Middle-click autoscroll** (hold middle button and move to scroll), if
      it is easy.

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
- Self-hosted cloud saves on Cloudflare.
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
