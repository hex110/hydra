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
8. **Home page.** Shipped: [Home page](features/home.md).
   1. [x] Redesign around your own games
   2. [x] Play heatmap and streaks
   3. [x] Personalised suggestions (from Hydra's own play history and
          similar-games list; Backloggd and IGDB moved to "Not scheduled yet")
9. **Design and QoL.** Library, home page, catalogue and game page,
   compared with Steam and Playnite (2026-10-20). The first eight are the
   cheapest fixes for the most friction; the rest follow by page.
   1. [x] One name per context-menu entry
   2. [x] Quieter cards
   3. [x] Visible installed filter
   4. [x] Play from the card
   5. [x] Library state in the catalogue
   6. [x] Updates and downloads on the home page
   7. [x] Multi-select
   8. [x] Wishlist with download alerts
   9. [x] Steady library header
   10. [x] One filter system for sidebar and library
   11. [x] Card size slider
   12. [x] Local collections
   13. [x] Saved filters
   14. [x] Group by
   15. [x] Details pane
   16. [x] Keyboard navigation
   17. [x] Surprise me from your library
   18. [x] Notes per game
   19. [x] Library statistics
   20. [x] Recently added shelf
   21. [x] News for your games
   22. [x] Almost done shelf
   23. [x] Customisable home shelves
   24. [x] Friends activity
   25. [x] Catalogue grid view
   26. [x] Hover previews
   27. [x] Catalogue front page
   28. [x] More data on catalogue rows
   29. [x] Load more and keep your place
   30. [x] Your stats on the game page
   31. [x] DLC and news on the game page
   32. [x] Your other copies on the game page
   33. [x] Check slow covers while signed out
10. **Tracking with Floppy and Steam.** Floppy is the record of what you
    played, rated and planned; Steam is a source; Hydra is the view and the
    launcher. Shipped: [Floppy sync](features/floppy.md),
    [Steam history](features/steam-history.md).
    1. [x] Push playtime, status and wishlist to Floppy
    2. [x] Pull status, rating and wishlist from Floppy; rating on the game page
    3. [x] Steam playtime, achievements with unlock dates, activity deltas
    4. [x] Steam games you own appear in the library as uninstalled entries,
           with their history (opt-in; [Steam history](features/steam-history.md))
    5. [x] Floppy-only games (played outside Steam) added to the library,
           matched to the catalogue ([Floppy sync](features/floppy.md))
    6. [x] Background tasks on the Downloads page
    7. [x] Completion suggestions: offer Finished at 100 % achievements or at
           the How Long to Beat main-story time
    8. [ ] ~~Per-session history pushed to Floppy~~ Declined: Floppy would
           count each day as a replay ([why](features/floppy.md#why-there-is-no-per-session-history))
    9. [x] Steam wishlist and release notifications ([Steam history](features/steam-history.md#steam-wishlist))
    10. [x] Fix a wrong or missing Floppy match from the game's options
    11. [x] Polish: remove what an import added, failure reasons with Try again,
            settings as integration cards, imported games become yours once
            downloaded or launched
11. **Hydra without an account.** Everything works signed out; the Hydra
    account becomes an optional setting, off by default. Decided 2026-10-26;
    details in [Hydra without an account](#hydra-without-an-account).
    1. [ ] Remove the upstream Steam integration
    2. [ ] SteamGridDB with your own API key
    3. [ ] Account-only features shown only when signed in
    4. [ ] One "Hydra account" setting
    5. [ ] Self-hosted saves: folder target
    6. [ ] Self-hosted saves: rclone target
    7. [ ] Self-hosted saves: automatic sync and conflicts
12. **More save sources.**
    1. [ ] Heroic and Lutris
    2. [ ] Ludusavi backups
    3. [ ] Steam's own prefixes
    4. [ ] Steam Cloud
    5. [ ] Hydra cloud account
13. **Distribution.**
    1. [ ] Export and import settings
    2. [ ] pacman updates
    3. [x] Sign the browser add-on
    4. [ ] Translations
14. **Mods.** Native mod support, after a design.

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
- Design and QoL comes before the backend phases because it is what is felt
  every day, and it builds on the data phases 7–8 added (catalogue cache,
  play status, play activity). It is large; split it over several releases
  in the order listed.
- Hydra without an account comes before the other save work: self-hosted
  saves are the save store the other sources can feed, and with Floppy and
  Steam history shipped, the upstream Steam integration only duplicates them
  (both write a game's Steam playtime, differently). The cheap items go
  first, so the account is truly optional before the large saves work starts.
- Save sources are independent of everything else; Heroic/Lutris and
  Ludusavi are cheap, Steam Cloud needs a Steam login, Hydra cloud waits on
  the account existing.
- Settings export makes the postponed laptop install a one-step job.
  Translations go last, once the settings pages stop changing.
- Mods are the largest item and need a design before any of it is built.

## Hydra without an account

Decided 2026-10-26. Hydra's servers do two jobs. Public data (catalogue,
search, game details, artwork, achievement names, download sources, update
checks) needs no account and stays: there is nothing realistic to self-host
it with. Account features are replaced or hidden:

| Account feature                                 | In Hydra Plus                                       |
| ----------------------------------------------- | --------------------------------------------------- |
| Profile, library and playtime sync              | [Floppy](features/floppy.md)                        |
| Upstream Steam integration                      | [Steam history](features/steam-history.md); removed |
| Collections                                     | Local collections (already shipped)                 |
| Hydra Cloud saves (paid)                        | Self-hosted saves (folder, rclone)                  |
| SteamGridDB artwork                             | Your own SteamGridDB API key                        |
| Epic, RetroAchievements connections             | Only shown when signed in (not used)                |
| Friends, chat, reviews, profile page, souvenirs | Only shown when signed in                           |

**Rule: hide, don't delete.** About 90 upstream files call Hydra's API.
Deleting account code would make every upstream merge conflict, so
account-only features leave the interface and stop their background jobs
while signed out, and their code stays. Only self-contained modules with a
replacement are deleted (the upstream Steam integration).

1. **Remove the upstream Steam integration.** Delete the settings card, Steam
   OAuth, the sync orchestrator, startup and exit syncs. Check first what
   still reads `hasActiveSteamImport`: the Steam tab, the process watcher's
   playtime policy (`resolveActiveSteamImport` asks Hydra's server), game
   setup skipping, and the profile merge. Games it imported stay in the
   library and move to Steam history's flag so they keep their tab.
   Disconnecting in a build that still has it is the only way to delete the
   copy on Hydra's servers; say so in the release notes.
2. **SteamGridDB with your own API key.** A field in the artwork settings;
   the key is free at steamgriddb.com. Signed-in users without a key keep
   Hydra's proxy.
3. **Account-only features shown only when signed in.** Friends, chat,
   reviews, the profile page, souvenirs, Hydra Cloud panels and upsells,
   the Epic and RetroAchievements cards. Their background jobs (SSE, friend
   snapshots, profile uploads) don't start while signed out. Audit what
   breaks or nags signed out today first.
4. **One "Hydra account" setting.** Sign-in moves out of the sidebar into a
   settings card that says what an account adds. Signing out stays as it is.
5. **Self-hosted saves: folder target.** Snapshots written to a folder you
   pick (a Syncthing folder, a NAS mount, Nextcloud), in Hydra Cloud's
   snapshot format so the save-import restore code applies. Backup, list,
   restore per game.
6. **Self-hosted saves: rclone target.** The same store through an rclone
   remote, which covers Cloudflare R2, S3, Google Drive, SFTP and WebDAV.
   Uses the user's rclone config; Hydra does not store cloud credentials.
7. **Self-hosted saves: automatic sync and conflicts.** Back up on game exit,
   offer a restore on first launch on a new machine, and detect when two
   devices changed the same save. CappyT's local and rclone stores and
   per-device conflict detection are the reference
   ([fork survey](fork-survey.md)).

## Design and QoL

Found by comparing the library, home page, catalogue and game page with
Steam (the catalogue standing in for its store) and Playnite. Numbers match
the list in the order above.

### Fix first

1. **One name per context-menu entry.** Renaming "Properties" to "Options"
   (phase 4) clashed with the existing "Options ▸" submenu (hide, pin,
   folders, remove), so the menu shows `Options ▸` and then `Options`.
   Rename the submenu to "Manage", like Steam.
2. **Quieter cards.** Every card shows a playtime badge, even "0 minutes",
   and a "Ready" badge on installed games. Show playtime only when there is
   some, drop "Ready", and dim the covers of games that aren't installed, as
   Steam does.
3. **Visible installed filter.** "Show installed only" is a lone
   check-circle icon labelled only by a tooltip. Move it into the Filters
   menu or make it a labelled toggle.
4. **Play from the card.** Every click opens the game page; Steam shows a
   Play button over the cover on hover.
5. **Library state in the catalogue.** Mark catalogue rows "In library" or
   "Installed" and add a filter that hides owned games. Today only the +
   button turning into a check shows it.
6. **Updates and downloads on the home page.** Shelves for games with an
   update available (update detection only shows on the game page) and for
   downloads in progress.
7. **Multi-select.** Ctrl/Shift-click cards, then act on all of them from a
   bar: add to a collection, set play status, hide, uninstall (Playnite).
8. **Wishlist with download alerts.** Steam's wishlist alerts on sales;
   Hydra's would alert when a download source adds the game or a newer
   release appears. New download options are already tracked per source.

### Library

9. **Steady library header.** A wheel handler collapses the header on the
   first downward scroll and swallows that scroll. Keep a slim sticky bar
   with search, tabs and Filters instead.
10. **One filter system for sidebar and library.** The sidebar has its own
    filter and sort menu that looks like the library's but doesn't share its
    state. Share it, or have the sidebar list follow the library's tab and
    filters, as Steam's left list does.
11. **Card size slider.** One slider instead of three unlabelled view icons
    (grid, compact, large).
12. **Local collections.** Collections need a Hydra account, Favorites
    don't; signed out, "Create collection" opens sign-in. Keep collections
    locally and sync them only when signed in.
13. **Saved filters.** Save a filter combination as a collection that
    updates itself, e.g. "Installed RPGs under 15 h" (Steam's dynamic
    collections).
14. **Group by** play status, genre, source or installed, with collapsible
    headers (Playnite).
15. **Details pane.** Selecting a game shows cover, Play, playtime, last
    played, status and achievements next to the grid, without leaving the
    library (Playnite).
16. **Keyboard navigation.** Type to jump to a title, arrow keys between
    cards, Enter to open or play.
17. **Surprise me from your library**, picking among installed games. The
    home page's version picks from the store.
18. **Notes per game.** A free text field on the game record ("stuck at
    chapter 3", "needs Proton 9").
19. **Library statistics.** Playtime by genre and month, completion rate,
    counts per status, from the play activity and catalogue cache.

### Home page

20. **Recently added shelf**, for games added or scanned but not opened.
21. **News for your games.** Steam's `ISteamNews/GetNewsForApp` is public
    and needs no key.
22. **Almost done shelf.** Games above 80 % of their achievements, or with
    playtime close to their How Long to Beat time.
23. **Customisable home shelves.** Hide and reorder shelves, including the
    heatmap and suggestions (Steam's library home).
24. **Friends activity**, when signed in: what friends are playing.

### Catalogue

25. **Catalogue grid view** with covers, next to the list rows.
26. **Hover previews.** A screenshot or trailer on hover, as on Steam's
    store; the game page already loads them.
27. **Catalogue front page.** The catalogue opens straight into search and
    filters. Start with featured games, "Recommended because you played"
    (the home page's ranking), new releases, tags to browse and a discovery
    queue.
28. **More data on catalogue rows.** Metacritic and How Long to Beat next to
    the ProtonDB badge, and repack size.
29. **Load more and keep your place.** Replace numbered pages with "Load
    more" or infinite scroll, and keep the scroll position and filters when
    coming back from a game page (check what is kept today first).

### Game page

30. **Your stats on the game page.** A "Your stuff" block like Steam's:
    playtime, last played, achievement progress, play status, notes and
    update status in one card, apart from the store details. The Play status
    button moves there from the action row.
31. **DLC and news on the game page.** The cached Steam details already
    list DLC ids.
32. **Your other copies on the game page.** Links to the game's other
    copies and versions in the library, and similar games you own next to
    the existing similar games.

### To check

33. **Check slow covers while signed out.** In a signed-out sandbox many
    library covers stayed blank until artwork loaded. Find out whether that
    happens on every start. Checked 2026-10-20 in a signed-out sandbox with an empty
    image cache: covers showed on first start, and after a reload all 56
    library covers on screen had loaded within two seconds. Not reproduced;
    nothing changed.

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
- [ ] **Backloggd or IGDB suggestions.** Backloggd has no API or export and
      sits behind a proof-of-work bot check; IGDB needs the user's own Twitch
      client id and secret. See [Home page](features/home.md#other-sources).
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
- [x] **Sign the browser add-on.** Mozilla signs it as unlisted for Firefox
      and Zen; a Chrome Web Store listing is still open.

## Postponed

- Built-in download sources, and why the laptop gets different server source
  ids for the same URL.
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
