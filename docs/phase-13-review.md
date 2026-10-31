# Phase 13 review: findings

The review pass of roadmap phase 13 ("One app, easy for everyone"), started
2026-10-31. It is measured against the [Principles](roadmap.md#principles).
Fixes come from this list (phase 13 item 2): bugs first, then coherence, then
polish. Tick an item when it is fixed, with the commit.

## How it was reviewed

- **The laptop** (`hp-laptop-ari`): i5-1235U, 7.4 GB RAM, Intel UHD plus an
  NVIDIA MX550 (offload only), Hyprland, Hydra Plus 4.1.6-plus.18 signed in to
  a Hydra account, cloud saves on R2 through rclone, a 775-game library. Read
  over `tailscale ssh`: Hydra's logs, run records, the journal, coredumps.
  Only the 2026-10-30 entries are Hydra Plus; older ones came over with
  upstream Hydra's data (`/opt/Hydra` in their stack traces).
- **A copy of the desktop's library** (775 games, account, preferences,
  integrations and downloads removed) in a dev sandbox, for memory and CPU.
- **A fresh signed-out sandbox** with no data, walked as a new user: home,
  game page, download dialog, add to library, game options, settings.
- **The code**, for assumptions about the developer's machine.

Not walked yet, because they need the owner's accounts or real games: Floppy
sync, the Steam history import, the AnkerGames browser handoff, RenoDX and
OptiScaler on a real game, save sync with R2 after the 2026-10-30 fixes.

## Bugs

1. [x] **A run loses its outcome when Hydra stops right after the game.**
       `finishRun` classifies the outcome but writes it only after the
       3-second log wait. On the laptop the owner rebooted one second after
       the game closed, so the record stayed "still running (exit code 134)"
       after 34 minutes of play. Runs left running by a Hydra crash also keep
       "still running" in `summary.md` forever; only the interface masks it as
       "unknown", but agents read the file. Write the outcome at once, add the
       logs after, and mark leftover running runs on startup.
       (`src/main/services/game-runs/game-runs.ts`) Fixed: the ending is
       written when the run ends, and startup marks leftover runs unknown.
       This was also why both laptop runs had no logs: the copy runs after
       the wait, which neither run reached. The log paths were right.
2. [x] **umu runs collect no logs.** Both laptop runs say "No logs were found"
       though both logs exist (`~/steam-1931770.log`,
       `<userData>/logs/umu-1931770.log`; the umu log held the crash cause,
       `free(): corrupted unsorted chunks`). Same cause as finding 1.
3. [x] **Proton logs pile up in the home folder.** Every umu launch sets
       `PROTON_LOG=1` (`src/main/services/umu.ts`), so `~/steam-<id>.log`
       files of up to 18 MB stay in the user's home and are never cleaned.
       Write them to a folder Hydra owns (`PROTON_LOG_DIR`) and copy into the
       run. Fixed: `<userData>/logs/proton/`, unless the user set
       `PROTON_LOG_DIR`. Still open: one log can grow past 4 GB
       (`docs/enshrouded-launch-crash.md`); deleting it after the copy would
       break the quick-exit dialog's **Show log**, which opens it.
4. [x] **Cloud save upload raced the game's start.** At 13:28:23 the game
       launched; at 13:28:32 a `game-page-open` sync failed with "md5 hashes
       differ" uploading the save folder the starting game was writing. A
       sync should not run while the game is starting or running. Fixed:
       page-open and prefix-change syncs wait until the run ends.
5. [x] **Cloud save errors on the laptop**, all on 2026-10-30 with plus.18:
       "Failed to hash restore file" and "Not found in the save store" are
       what 186344a25 fixed (versions written without their files on object
       stores); confirm after installing the fix. Also seen:
       `cloud_save_restore_prefix_invalid` on the `environment-changed`
       trigger. Check what the user sees when an automatic sync fails (an
       event is sent; the laptop log shows 12 failures). Checked 2026-10-31
       against R2 with a test path: upload, restore (byte-identical), a second
       device's conflict and **keep remote** all work with the fixes. The
       prefix error was a prefix not created yet; it is now a skip. A failed
       automatic sync is shown only on the game's page while it is open;
       making backup state visible elsewhere is roadmap item 6.
6. [x] **The upload after exit can be cut off.** The after-exit sync started
       at 14:02:57 and Hydra quit at 14:02:58 for a reboot. Check that an
       interrupted upload is retried on the next start. It was not (only when
       the game's page was opened or it was launched again). Fixed: a pending
       marker, and a full sync 30 s after the next start; tested with R2.
7. [x] **Dev worktrees can't run save backups.** `scripts/worktree-setup.sh`
       copies the main checkout's `ludusavi/` into the worktree's tracked
       `ludusavi/`, nesting it as `ludusavi/ludusavi/`; startup then fails
       with "Recursive option not enabled, cannot copy a directory". Fixed:
       existing folders get the contents copied in.

## Performance on a modest machine

8. [ ] **The laptop ran out of memory during a game.** At 13:27:41
       `systemd-oomd` killed the whole Hyprland session (635 processes, the
       game included). The 3.5 GB peak (plus 866 MB swap) first read as
       Hydra's was its systemd scope, which also holds everything Hydra
       starts, the game under Wine included, and the page cache those
       processes fill; it is not Hydra's own use. Hydra's own use with the same
       775-game library, measured in a dev build: about 1 GB (main ~400 MB,
       renderer ~500–650 MB after garbage collection). Paging through home,
       library and catalogue grows the renderer by ~15 MB a round after GC
       with steady DOM node and listener counts, so no DOM leak; the rest is
       uncollected garbage and image caches. On a 7.4 GB machine 1 GB for a
       launcher in the background is still a lot: measure a production build
       on the laptop and consider freeing the renderer while a game runs.
9. [x] **Hydra uses CPU while idle.** The laptop scope's 1 h 6 min of CPU in
       a 34-minute session includes the game (see 8). Hydra itself, idle with
       775 games, used ~11 % of a core here. A CPU profile put the achievement
       watcher first: every 2 s it read every game's prefix, and the default
       prefix path is returned for every game whether or not it exists, so
       775 mostly missing prefixes were scanned. Fixed: missing prefixes are
       skipped, and games not running are scanned every 30 s instead of
       every 2 s (a running game, and one closed in the last minute, every
       tick). JS time fell from 812 to 307 ms per 15 s and the main process
       from ~11 % to ~7.6 % of a core; most of the rest is process
       enumeration, which upstream's #3010 also touches.

## The machine (roadmap item 3, Auto fits the machine)

10. [ ] **No hardware detection.** Hydra knows nothing about the GPU or the
        displays. The monitor switch is offered whenever Hyprland and
        `hypr-hdr` exist, also on an SDR laptop panel.
11. [ ] **Hybrid laptops run games on the integrated GPU.** On the laptop the
        MX550 is offload only, and DXVK picked it by default, which gave a
        black screen with sound. The workaround forces Intel for the whole
        session in `~/.config/uwsm/env-hyprland`
        (`DXVK_FILTER_DEVICE_NAME=Intel`), so every game runs on the UHD iGPU.
        Hydra could do PRIME render offload per game (`__NV_PRIME_RENDER_OFFLOAD=1`,
        `__VK_LAYER_NV_optimus=NVIDIA_only`, `DRI_PRIME=1`), as Steam does,
        with Auto picking the discrete GPU. Needs a hand test on the laptop.
12. [ ] **A new user gets no tools.** OptiScaler, RenoDX, MangoHud, GameMode
        and the HDR rules all default to Never on a fresh install; they stay
        off until the user finds Tool defaults. Auto can become the default
        once it checks the machine (findings 10–11), e.g. GameMode on when
        `gamemoderun` exists.
13. [ ] **The default Proton build is unclear.** Settings → Compatibility
        offers "Auto (global default or umu default)" without saying which
        build that is. umu's default (UMU-Proton 10) has no Wayland HDR, so
        RenoDX is blocked by default; GE-Proton auto-install is off.

## First run (principle 1)

14. [ ] **No first-run guidance.** A fresh install opens upstream's store
        home. Nothing introduces where games go, the library folders, the
        tools or cloud saves.
15. [ ] **Games are installed into the Downloads folder.** The default
        download path is `~/Downloads` (or `$HOME` when there is no XDG
        Downloads folder); the laptop's game lives in
        `~/Downloads/Chants-of-Sennaar-AnkerGames/`. Steam and Heroic use a
        games folder.
16. [ ] **Archives are kept after extraction by default**, so a download
        needs twice its size for good. Upstream's in-place extraction (#3009)
        changes this; decide together in phase 14.

## Coherence

17. [ ] **Twelve tabs in a game's options.** Tools, Compatibility, Runs,
        OptiScaler, RenoDX and Saves all describe what Hydra does to the game;
        Compatibility's setup log repeats the ReShade, RenoDX and OptiScaler
        steps that Tools shows, and four tabs (General, Compatibility,
        OptiScaler, RenoDX) carry a "set in Tools" pointer to a fifth.
18. [ ] **Defaults live in three places.** The Tools tab's reasons point to
        Settings → Launch rules (HDR), Settings → Tool defaults (MangoHud,
        GameMode) and Settings → RenoDX (beta mods).
19. [ ] **Eighteen settings categories at one level** (17 signed out; roadmap item 4).
20. [ ] **The Cloud page assumes history.** "While this is on it replaces
        Hydra Cloud, also for subscribers" and "Your list of games is
        uploaded, never added back on its own" need knowledge a new user does
        not have (roadmap item 6).
21. [ ] **Work Wonders widgets load while signed out.** Upstream's changelog
        and knowledge widgets open three iframes on
        `hydra.workwonders.app` with an empty token.
22. [ ] **Every game is in the laptop's app launcher twice.** A script-era
        `hydra-desktop-sync` timer (every 2 minutes) writes
        `hydra-game-*.desktop` next to Hydra Plus's own `hydraplus-game-*`.
        Machine setup, not app code: disable the timer and delete its
        entries, with the owner's go-ahead.

## Polish

23. [ ] Native `<select>` and checkboxes on Settings → General (language,
        startup behaviour) and Settings → Cloud ("Where to keep saves"); the
        UI rules forbid them. Settle in the regroup.
24. [ ] The setup log offers "Run again" for steps that never ran.
25. [ ] Game options → General: the "Launch Options" heading is larger than
        the "Title" label above it, and "Clear" next to the title doesn't say
        what it clears.
26. [ ] The sidebar's library filter still has two unlabeled icons (installed
        only, filters); phase 9 item 3 labelled them on the library page only.
