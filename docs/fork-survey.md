# Other Hydra forks

A survey of other forks of `hydralauncher/hydra`, done 2026-10-19, to find
work worth porting instead of rebuilding. Items that made the cut are in
`roadmap.md`; this file keeps the reasons, so the same forks don't need
checking again.

Fork code is reference only: it is rewritten to match this codebase, never
merged or cherry-picked. All of the forks are MIT, like upstream.

## How the forks were picked

Upstream rewrote `main` around late July 2026, so GitHub's "ahead by" count
is wrong for every fork made before that (they show 5,000+ ahead and 6,523
behind). The 378 forks pushed after they were created were fetched, and
their commits were matched against upstream by author, author date and
subject. Commits found in three or more forks (upstream developers' commits
that dropped out of `main` in the rewrite) were removed as well.

| Fork                                                            | Own commits | Last commit | Main topics                                                                                |
| --------------------------------------------------------------- | ----------- | ----------- | ------------------------------------------------------------------------------------------ |
| [CappyT/hydra](https://github.com/CappyT/hydra)                 | 139         | 2026-09-25  | Accountless mode, bubblewrap sandbox, local and rclone save backups, gamescope             |
| [GameOneDev/hydra](https://github.com/GameOneDev/hydra)         | 91          | 2026-10-05  | Self-hosted server, cloud save version manager, playtime heatmap                           |
| [entitybtw/hydra](https://github.com/entitybtw/hydra)           | 149         | 2026-08-13  | Self-hosted API, Steam URI launch, installer detection, SteamGridDB                        |
| [Chrispsz/hydra-plus](https://github.com/Chrispsz/hydra-plus)   | 72          | 2026-10-13  | Google Drive saves, Online-Fix, umu-run launcher (unrelated to this fork despite the name) |
| [Shaiyon69/chimaera](https://github.com/Shaiyon69/chimaera)     | 37          | 2026-10-17  | OptiScaler with FSR4 DLLs, launcher import, theme presets                                  |
| [abrahampo1/hydra](https://github.com/abrahampo1/hydra)         | 105         | 2026-06-13  | Local API replacement, storage page, play streaks, home redesign                           |
| [atxoxx/hydraplusplus](https://github.com/atxoxx/hydraplusplus) | 107         | 2026-06-21  | Activity page, metadata editing, library sub-tabs, store imports                           |

## Confirmed on our code

Each of these was checked against `main` at `acee394bd`. They are scheduled
in the roadmap's "Fixes from other forks" phase unless noted.

- **Add to Steam swaps the game's prefix** (CappyT `0af1229f0`).
  `configureLinuxWinePrefix` in `create-steam-shortcut.ts` sets
  `winePrefixPath` to an empty Steam `compatdata/<appid>/pfx` whenever the
  game has no explicit prefix. Games set up by Hydra use the default
  per-game prefix (`Wine.getEffectivePrefixPath`), so adding a game to Steam
  points Hydra at a prefix without its setup or saves. CappyT also routes
  Linux Steam shortcuts through the `run` deep link, so launches keep
  Hydra's launch rules. Fixed 2026-10-19 the other way, by choice: Steam's
  Proton runs the game in Hydra's prefix, keeping the Steam overlay and
  Steam Input.
- **Library doesn't refresh after a playtime change** (entitybtw
  `7fbafec88`). `handleChangePlaytime` and the reset only call
  `updateGame()`, and neither main-process event notifies the library.
- **Catalogue requests fail without handling** (CappyT `bf29c7154`,
  GameOneDev `ae440fe4b`, Chrispsz `a0844befa`). In `use-catalogue.ts` the
  publishers, developers and filter fetches have no `catch`. In
  `catalogue.tsx` a failed `/catalogue/search` leaves `isLoading` true, so
  the skeleton never goes away.
- **Achievements without metadata never notify** (CappyT `a83302a56`).
  `merge-achievements.ts` drops unlocks that have no catalogue entry before
  building notifications; CappyT falls back to the raw name.
- **Old achievements can replay as new unlocks** (GameOneDev `194115989`).
  Upstream now fills the memory store from the server before diffing, which
  covers the signed-in case. Still open: signed-out users (the server fill
  returns nothing, so the whole file reads as new), turning on Steam
  achievements (the Steam cache holds the account's full history), and no
  cap on a burst of popups. Port the cap (one combined notification above
  ten) and the signed-out baseline.
- **Videos fast-forward after the window was hidden** (CappyT
  `68c80d853`). The game page autoplays muted videos and nothing pauses them
  on `visibilitychange`.
- **Gamescope runs at 60 Hz when no size or rate is set** (CappyT
  `eea7bd56c`). `buildGamescopeLaunchOptions` passes only what the user
  filled in. Default `-W`/`-H`/`-r` to the display the window is on; CappyT
  falls back to `xrandr` because Electron reports 0 Hz on many Wayland
  sessions. Also skip gamescope inside a gamescope session (`ab0fc415c`).
- **Cancelling a download always deletes its files** (abrahampo1
  `0cbac011a`). `DownloadManager.cancelDownload` calls the downloader's
  `cancelDownload()` with its `deleteFile = true` default; offer "keep the
  files" in the cancel and remove dialogs.
- **The window waits for network work** (GameOneDev `6d8f9cad0`).
  `initializeApp` awaits `loadState()`, which awaits `HydraApi.setupApi()`
  and Epic init, before it creates the window. Measure the delay offline
  first; GameOneDev split startup into `prepareForWindows()` and a
  background `loadState()`.

Found along the way, not from a fork:

- **`hydralauncher://` returns go to upstream Hydra.** With both apps
  installed, `xdg-mime` resolves `x-scheme-handler/hydralauncher` to
  `hydralauncher.desktop`. Steam sign-in returns to
  `hydralauncher://steam-connected` (`start-steam-oauth.ts`), which we
  choose and can switch to `hydraplus://`. Hydra account sign-in returns to
  `hydralauncher://auth`, which Hydra's website sends, so it may need a
  different fix. Desktop shortcuts are unaffected: they pass the link to our
  binary as an argument.

## Features worth porting

Scheduled in the roadmap section named in brackets.

- **Metadata editing** (atxoxx `20d084f03`, `c2ff410cb`) [Library]. Edit a
  game's title, description, images and so on, with a language choice for
  the metadata search. Large (6.5k lines); take the design, not the code.
- **Image search across all providers** (atxoxx `2468894c3`) [Library].
  Query every artwork provider in parallel. Upstream already has a
  SteamGridDB picker, so this extends it.
- **Hide duplicate library entries** (chimaera `d5f82ad89`) [Library].
  Keep one entry per title, preferring the Steam copy, then the one with
  more playtime.
- **Download state on library cards** (abrahampo1 `2551b6cef`) [Library].
  Show downloading, extracting and setup progress on the card, so the
  library shows what is in flight without opening Downloads.
- **Play heatmap and streaks** (abrahampo1 `19035e55c`, `64c12863c`;
  GameOneDev `f306fff75`) [Home]. The process watcher records play per day;
  a 13-week heatmap and a streak badge read it.
- **Home redesign references** [Home]. abrahampo1 `62e4d7b2e` (cover-art
  cards, "Continue playing"), atxoxx's activity page (sessions, charts).
- **Storage page** (abrahampo1 `cb29fb9db`) [Unscheduled]. Disk use per
  game with a breakdown bar, and freeing space from there. Upstream already
  deletes archives after extraction, so "delete the installer only" is
  covered.
- **FSR4 DLLs and anti-cheat scan for OptiScaler** (chimaera `6a4fe4d22`,
  `fa2b3af3f`) [Unscheduled]. Downloads FSR4 override DLLs for GPUs without
  native FSR4 (RDNA3, integrated graphics); RDNA4 like the RX 9070 doesn't
  need them. Scans the game root for anti-cheat files, on top of our
  compatibility-list check.
- **Installer detection after download** (entitybtw `f266de374`)
  [Unscheduled]. Finds a `setup`/`install` exe in a finished download and
  offers to run it, then to set the game path. Compare with our exe guess
  after extraction first.
- **Local and rclone save backups** (CappyT `aad6ac4e5`, `9cd761e07`,
  `c8fec688c`, `0634ab35f`) [Postponed: cloud saves]. A pluggable backup
  store, conflict detection through a per-device id, and restoring the
  latest backup on first launch when this device has no saves. Reference
  for the postponed self-hosted cloud saves.
- **`--no-tray` flag** (CappyT `ada7d17a1`) [Unscheduled]. Quit when the
  window closes.

## Checked and dropped

Already in upstream (these forks predate it):

- Collections, hidden games, SteamGridDB artwork picker, sidebar sorting,
  playtime editing, Big Picture mode, How Long to Beat.
- Desktop library: installed, source (Hydra/Steam/Epic), platform and
  collection filters, six sort options.
- Extraction passwords (tried from a list), deleting archives after
  extraction.
- Real-Debrid over IPv4, the VikingFile quota error, no live connection
  while signed out (upstream replaced the WebSocket with SSE).
- The catalogue's Proton filter ordering bug (Chrispsz `412ee7a8c`).

Not applicable here:

- Self-hosted servers, passkey login, dual accounts (entitybtw,
  GameOneDev), and their fixes: case-insensitive achievement names, games
  missing from a self-hosted library, Cloudflare user agents, direct HLTB
  calls.
- Social features: friend feed, online-friend avatars, chat.
- Removing upstream's subscription gates (abrahampo1).
- CappyT's bubblewrap/seccomp sandbox and its launch-grace fix for sandbox
  process churn; accountless mode.
- Launcher import (chimaera `8a78ff017`): Windows-only (Epic, GOG, Ubisoft,
  …), so it doesn't help the Heroic and Lutris item.
- `~/.local/bin` in the binary search path (CappyT `2d6232a7d`): only
  matters under Steam gaming mode's minimal `PATH`.
- Linux `.desktop` `%u` fixes (entitybtw): our package's entry already uses
  `%U` and lists both schemes.
- Rebrands, icon uploads, macOS (cometmcisaac), Android (DuduSync) and the
  Online-Fix rewrite (Chrispsz), which our OnlineFix prep already covers.
- chimaera's CORS change (`b77611ce4`): limits upstream's header override
  to images and media. No symptom seen here; revisit only if renderer
  requests misbehave.
