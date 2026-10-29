# HDR and RenoDX: plan

Written 2026-10-29. It starts from one report: Enshrouded (an AnkerGames
download, RUNE crack) showed only an error window. Chasing that led to HDR,
OptiScaler and then the question "can Hydra Plus add RenoDX to games that have
a mod?", with [RHI](https://github.com/RankFTW/RHI) as the Windows tool that
already does it. This file records what was found, what shipped, and the order
we recommend for the rest.

## What shipped

| Commit                                                        | What                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `fix(launch): turn off Proton's Steam bridge …`               | `lsteamclient=d` for every Windows game, so cracks with their own `steamclient64.dll` start.      |
| `feat(optiscaler): pick the proxy DLL name for each game`     | Automatic proxy name: wiki `Filename`, then Vulkan names, then `dxgi.dll`; never a taken name.    |
| `feat(launch-rules): built-in rule that switches the monitor` | Off-by-default rule `hypr-hdr %command%`, switchable per game.                                    |
| (outside the repo) `~/.local/bin/hypr-hdr`                    | The wrapper the rule runs: monitor to HDR, run the game, monitor back. Documented in system-docs. |

See [Launch rules](features/launch-rules.md#hdr-switch-the-monitor-hyprland),
[OptiScaler](features/optiscaler.md) and
[OnlineFix](features/online-fix.md#steam-emulators-and-protons-steam-bridge).

## Findings

### Two HDR tiers

**The built-in HDR rule is enough for many games.** `PROTON_ENABLE_WAYLAND=1
PROTON_ENABLE_HDR=1 DXVK_HDR=1` is the existing rule, and games such as Ace
Combat 8 get HDR from it alone. The monitor switch below is for the games that
check for HDR at startup and never get it. So `hypr-hdr` is the second tier,
not the first; RenoDX is a third layer for games whose own HDR is missing or
poor (see "RenoDX and the two tiers" under the design).

### Some games need the monitor in HDR before they start

Verified with Enshrouded under GE-Proton 11. With the monitor in `srgb` the
game logs `HDR supported: false` and never offers HDR. With the monitor
switched to `cm = "hdr"` first, the same game logs `HDR supported: true` and
`Vulkan surface supports HDR`. Wine's Wayland driver reports HDR only for an
output that already is in HDR, and Hyprland's `cm_auto_hdr` switches an output
only after a game asks for HDR. Each waits for the other.

**Not verified:** HDR actually showing on screen. In the test harness the game
exited with code 3 after about two seconds, in SDR too. Hydra's own log shows
`umu-run exited early with code=3` for a second launch made while the first
was still running, which suggests Enshrouded refuses a second copy, but that
was not confirmed. It needs one real run started from Hydra.

### RenoDX can be matched by Steam ID

RenoDX is a ReShade add-on that replaces a game's tone mapping to output real
HDR. Its snapshot release carries `games-index.json` (found 2026-10-29): 241
games, 207 with a Steam app ID, 251 mods, each with title, aliases, status
(`stable` 131, `beta` 19, `experimental` 1, none 100), a compatibility note
and the add-on file name (`renodx-cp2077.addon64`; 200 x64, 23 x86). 29 mods
have no download. The wiki's Mods page lists the same games for people.

Against this library (2026-10-29): 36 of 773 games match by Steam ID, five of
the 152 installed ones: Cyberpunk 2077, Hades II, Absolum, Fallout 4 and
Sekiro. Enshrouded has no mod; it is Vulkan and RenoDX targets DirectX.

RenoDX needs ReShade 6.8+ built with full add-on support. The add-on file goes
into the game folder next to ReShade. The overlay opens with Home.

### How RHI does it

RHI is a Windows-only WinUI 3 app (.NET 8, GPL-3.0). It has no Linux support,
but everything it writes is plain DLLs and ini files.

1. Reads each game's executable: 32 or 64-bit from the PE header, graphics API
   from the import table including delay-loaded imports, engine from files.
2. Matches the game to a mod by **name**, using the RenoDX wiki's Mods page,
   its own databases and a `manifest.json` of per-game fixes
   (`dllNameOverrides`, `graphicsApiOverrides`, `installWarnings`, a
   blacklist). Games without a named mod get generic Unreal or Unity add-ons.
3. Fetches ReShade: scrapes reshade.me for the newest
   `ReShade_Setup_X.Y.Z_Addon.exe` (it needs a Referer header), then extracts
   `ReShade64.dll` and `ReShade32.dll` from the installer's appended ZIP with
   7-Zip.
4. Copies ReShade into the game as `dxgi.dll`, `d3d9.dll` or `opengl32.dll`,
   copies the `.addon64` or `.addon32` beside it, merges a seeded
   `reshade.ini` (add-on list, search paths, hotkeys, peak brightness) and
   installs shader packs.
5. Warns before overwriting another tool's DLL (DXVK, Special K, ENB), backs up
   what it replaces, and refuses archive paths that escape the game folder.
6. Switches Windows HDR on at launch and off at exit, which is what `hypr-hdr`
   does.

The goal is to cover RHI's other features too, wherever they can work on Linux.
[Scope against RHI](#scope-against-rhi) sorts each one. Steam-ID matching
(better than its name matching), the ReShade extraction trick, import-table API
detection, the foreign-DLL warning and the backup discipline come first.
**Licence:** Hydra Plus is MIT and RHI is GPL-3.0, so reimplement from the
ideas; do not copy its code or depend on its manifest.

### OptiScaler already knows how to coexist

`OptiScaler.ini` has `LoadReshade`: rename ReShade to `ReShade64.dll`, put it
next to OptiScaler and OptiScaler loads it. That avoids two mods fighting over
`dxgi.dll`, and RHI uses it too.

## Phase 0 results (2026-10-29)

Test game: **Sekiro** (DirectX 11, stable RenoDX mod `fromsoft_engine`), not
Cyberpunk 2077. The Cyberpunk install is the Steam copy with OptiScaler already
on `dxgi.dll`, and `/mnt/Storage` has too little room for a spare copy, so it
was not touched. Sekiro was clean. Setup: GE-Proton 11-11 through `umu-run`,
a throwaway prefix, `WINEDLLOVERRIDES=lsteamclient=d;dxgi=n,b`, ReShade 6.8.0
as `dxgi.dll`, the add-on beside it, a minimal `ReShade.ini`. Logs: ReShade's
own `ReShade.log` in the game folder.

| Run | Monitor | Env                               | Result                                                                                              |
| --- | ------- | --------------------------------- | --------------------------------------------------------------------------------------------------- |
| t1  | SDR     | adds `d3dcompiler_47=n`           | Exit 53 at once: `d3dcompiler_47.dll … not found`. See finding 1.                                   |
| t3  | SDR     | `dxgi=n,b` only                   | ReShade and RenoDX load. RenoDX upgrades the swapchain but `ChangeColorSpace` fails (`0x80070057`). |
| t4  | SDR     | plus the built-in HDR rule        | Same failure; the monitor stays `srgb`.                                                             |
| t5  | HDR     | built-in HDR rule plus `hypr-hdr` | Colour space `hdr10_st2084`, no errors. The game renders.                                           |

Findings:

1. **The existing ReShade rule is wrong under Proton.** It sets
   `d3dcompiler_47=n`, which needs a native `d3dcompiler_47.dll` in the prefix.
   Without one the game fails to start. Wine's built-in `d3dcompiler_47` is
   enough for ReShade to load. The rule should set only `dxgi=n,b`; fix it in
   phase 1.
2. **ReShade 6.8.0 and the RenoDX add-on work under Proton** with no extra
   setup. ReShade finds the add-on in the game folder by itself
   ("Searching for add-ons (`*.addon`, `*.addon64`) in the game folder"), so
   `reshade.ini` needs no add-on path. A seeded `ReShade.ini` only has to
   skip the first-run tutorial.
3. **RenoDX needs the monitor in HDR, not just the HDR rule.** With the
   built-in rule alone the colour space cannot be set. With the monitor
   switched first (`hypr-hdr`) it becomes `hdr10_st2084`. So installing RenoDX
   should turn on the HDR switch rule for that game, not only the built-in one.
4. **Extraction works**: 7-Zip reads `ReShade64.dll` and `ReShade32.dll` straight
   out of `ReShade_Setup_6.8.0_Addon.exe` (downloaded with a Referer header).
5. **RenoDX reads the display's peak brightness itself** (`Peak Nits: 1499` in
   its log), so seeding peak brightness may not be needed.
6. **`hypr-hdr` restores the monitor** when the game is killed.
7. The window's Wayland class is the exe name (`sekiro.exe`), not
   `steam_app_<id>`.

Still open: whether the picture is actually correct HDR (needs a person to look
at it), the overlay under Home, and unknowns 4 and 7 below. Synthetic Home key
presses sent with `hyprctl` did not open the overlay.

## Unknowns to settle first (phase 0)

These were the questions. Answered above: 1, 3 and most of 5. Open: 2 (visual),
4, 6, 7, and the Ace Combat 8 baseline.

1. **Does ReShade with add-ons run under Proton on this machine?** Wine
   overrides: the ReShade DLL natively, plus `d3dcompiler_47` (the existing
   ReShade rule sets both). Check the overlay opens with Home.
2. **Does a RenoDX mod produce HDR on screen?** The one thing nothing has shown
   yet. Use Cyberpunk 2077 (installed, DirectX, stable mod).
3. **Which HDR tier does RenoDX need?** Try each of: no HDR rule, the built-in
   HDR rule, and the built-in rule plus `hypr-hdr`. RenoDX upgrades the
   swapchain itself, but Wine may still report no HDR to the game. Also do the
   baseline: Ace Combat 8 with the built-in rule alone, so there is a known
   good run to compare against.
4. **Does the game's own HDR toggle matter?** Some mods say to turn the game's
   HDR off.
5. **Which `reshade.ini` keys are needed?** Start from RHI's template (the
   add-on list and search paths) and add only what proves necessary. Peak
   brightness is a RenoDX setting (`ToneMapPeakNits` in RHI's notes); this
   monitor reaches about 1200 nits on a 1% window and about 280 full-screen.
6. **Do shader packs matter?** RHI installs Lilium HDR as "essential". RenoDX
   mods may not need it; check before deciding.
7. **ReShade and OptiScaler together:** both proxies side by side, and with
   `LoadReshade`.

If 1 or 2 fail, stop and write down why before building anything.

## Scope against RHI

Every RHI feature, sorted by whether it can work here. "Portable" means it is
file copies, ini edits and downloads, so Proton does not stop it. Each portable
feature still needs a hand test under Proton first, the way phase 0 does for
RenoDX; anything that fails is moved to "Not portable" with the reason.

### Portable (planned)

| RHI feature                                              | Plan                                                                                                             | Phase |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----- |
| RenoDX named mods                                        | The core of this plan.                                                                                           | 2-3   |
| ReShade install, API-based DLL naming, foreign-DLL check | Core. Needs the PE import-table detector.                                                                        | 1-2   |
| `reshade.ini` seed and merge                             | Core. Hotkeys, screenshot path, peak brightness, add-on paths.                                                   | 1-2   |
| Backup, restore, manifest                                | Core, same shape as OptiScaler's.                                                                                | 2     |
| Update All, per-game update exclusions                   | One action for ReShade, RenoDX and the rest. Check at startup and daily, not every four hours.                   | 3     |
| UE-Extended (generic Unreal HDR)                         | `reshade.ini` plus `Engine.ini`. The `Engine.ini` lives in the game's Wine prefix, so the prefix path is needed. | 5     |
| Generic Unity HDR add-on                                 | Same pattern, no `Engine.ini`.                                                                                   | 5     |
| Luma Framework                                           | Named and generic Luma mods for DirectX 11 Unreal games, with the `Engine.ini` keys and launch arguments.        | 5     |
| RenoFX HDR Toolkit                                       | SDR-to-HDR for games with no mod.                                                                                | 5     |
| Per-game ReShade channels                                | Stable, nightly, custom, legacy, no add-ons.                                                                     | 6     |
| Add-on manager, custom add-ons folder                    | Enable or disable per game or globally.                                                                          | 6     |
| Shader packs (46), per-game selection, profiles          | Lilium HDR first; the rest as a browsable list.                                                                  | 6     |
| Vulkan ReShade (implicit layer)                          | A layer inside a Wine prefix is unproven; test before promising.                                                 | 6     |
| Frame limiters: ReLimiter, Display Commander             | Both are ReShade add-ons. Test under Wine; mutually exclusive per game.                                          | 7     |
| RE Framework                                             | Resident Evil engine mod; a `dinput8.dll` proxy, so Proton can run it.                                           | 7     |
| OptiScaler extras                                        | Per-GPU ini templates (AMD only), OptiPatcher and `LoadReshade` handling.                                        | 7     |
| HDR auto-toggle                                          | Done as `hypr-hdr`; phase 4 bundles it.                                                                          | 4     |
| DXVK with Lilium HDR (DirectX 9 HDR)                     | Proton's DXVK may already do this with `DXVK_HDR`. Test a DirectX 9 game before building anything.               | 5     |
| Manifest-driven fixes                                    | Our own manifest (per-game DLL names, API overrides, warnings, blacklist), written from our own findings.        | 2     |

### Left out for now: NVIDIA only

Decided 2026-10-29: these stay out of scope until someone with an RTX card
wants them and can test them. This machine has an AMD GPU, and they do nothing
there.

- DLSS and Streamline version manager (swap SR, RR, FG DLLs per game, back up
  the originals, global defaults, batch deploy, auto-update).
- DLSS5 Feeder, ShortFuse DLSS tool, DirectX 11 bridge, NR Cost Scaler.
- Multi Frame Generation unlocks for RTX 40 and the RTX 50 modes.
- DLSS presets and render-scale override (RHI uses NvAPI driver profiles; the
  Linux route would be DXVK-NVAPI environment variables, unchecked).
- The NVIDIA parts of OptiScaler's templates and Streamline deployment.

### Not portable (and why)

- **NVIDIA driver profiles through NvAPI** (VSync, low latency, Smooth Motion,
  ReBAR, G-Sync, shader cache, frame limit, digital vibrance, profile export):
  NvAPI is a Windows driver interface. Where a Linux equivalent exists (for
  example `__GL_*` variables or the existing MangoHud and gamescope actions) it
  belongs in launch rules, not here.
- **RTX HDR**: a Windows driver feature.
- **Store detection** for Epic, GOG, Xbox, EA, Ubisoft, Battle.net, Rockstar
  and itch.io: Hydra has its own library and import paths, and dragging an exe
  in is already covered by adding a game by hand.
- **Admin-only toggles** (ReBAR, Smooth Motion): follow from the driver items
  above.

## Recommended design

Follow the roadmap's rule: anything that copies files into game folders
belongs to Hydra. Copy the OptiScaler feature's shape, because it already
solved the same problems: manifest, backups, opt-out, setup step, per-game
page, update.

### RenoDX and the two tiers

RenoDX is not a replacement for the built-in HDR rule. The rule makes Proton
pass HDR through to the monitor; RenoDX changes what the game renders into it.
Phase 0 settles which games need both. The install code never touches the HDR
rules; it only reports, on the game's page, which HDR rules are currently on
for that game.

### Component model

RHI's features are all the same operation with different inputs: fetch an
archive or DLL from somewhere, copy named files into the game folder (or the
prefix), seed an ini, remember what was written, offer an update. Build that
once as a **component** so each feature is data and a small provider, not a new
copy of the OptiScaler code:

- A component has an id, a source (GitHub release asset, a URL, or a scraped
  page), the files to install and where, the ini edits, the conflicts it checks
  for, and how it finds its own version.
- One manifest per game (`.hydra-renodx.json`, widened to list components)
  records everything written and every backup. Remove and update work on one
  component without touching the others.
- Components declare the proxy DLL names they need, so the chooser can stop two
  of them taking the same name. This is the OptiScaler chooser generalised.
- OptiScaler stays as it is for now. Move it onto the component model only when
  a second feature has proven the shape.

### Catalogue

- Fetch `games-index.json` from the RenoDX snapshot release, cache it for a
  day under `<userData>/renodx/` (the compatibility-list pattern in
  `optiscaler-assets.ts`), and keep the stale copy when offline.
- Match by Steam app ID (`objectId` for Steam games), then by alias or title
  through `isSameTitle`. Names only for games without an ID.
- Offer stable mods by default; `beta` and `experimental` behind a setting.
  Skip mods with no download and the `engine` and `related` categories.
- Pick `addon64` or `addon32` from the executable's PE machine type.

### ReShade provider

- Scrape reshade.me for the newest add-on build, download with the Referer
  header, extract both DLLs with the existing 7-Zip service, stage them under
  `<userData>/reshade/<version>`. Stable only at first.
- Install under the name the API needs: `dxgi.dll` for DirectX 10 to 12,
  `d3d9.dll`, `opengl32.dll`. Use the proxy-name chooser from
  [OptiScaler](features/optiscaler.md) so a taken name is never replaced.
- Foreign DLL check before writing: an existing `dxgi.dll` from DXVK, Special K,
  ENB or ReShade itself is reported and nothing is overwritten.

### Graphics API detection

Replace the string scan in `optiscaler/graphics-api.ts` with a PE import-table
parser (imports and delay-load imports, plus "only `dxgi.dll` imported" meaning
DirectX 11 or 12). Both OptiScaler and RenoDX use it. It also fixes the cases
where the scan finds nothing (Car Park Capital, a Unity game that loads its API
from `UnityPlayer.dll`). Test it with small synthetic PE files.

### Install and uninstall

- A `.hydra-renodx.json` manifest beside the files, like OptiScaler's: every
  file and folder written, every game file moved to a backup folder. Remove
  deletes exactly those. Same sentinel idea as RHI: never delete a file Hydra
  did not write.
- Merge `reshade.ini` instead of replacing it; keep the user's edits.
- Updates: add-ons change often. Show "update available" per game and an
  "Update games" action, the way OptiScaler does.

### Launch

Reuse `getLinuxLaunchEnvironment`: the ReShade proxy name as `n,b` and
`d3dcompiler_47=n`, next to `lsteamclient=d`. The existing ReShade rule stays
for people who install by hand. The HDR rules stay separate and per game.

### Setup step

A RenoDX step at order **450**: after OnlineFix and save import, before
OptiScaler (500). ReShade then takes `dxgi.dll` first and OptiScaler's
chooser skips it, or OptiScaler loads ReShade through `LoadReshade`
(decide in phase 0). Windows executables under Proton only, never games
another launcher owns (Steam installs, Epic imports), and never games on
OptiScaler's "not working" list or with a known anti-cheat.

### UI

- Game options: a **RenoDX** section like the OptiScaler one (status, install,
  remove, version, opt-out). Check the game-page ownership table in
  `docs/features/game-page.md` first: the HDR state is one fact with one home,
  so any summary elsewhere links to it.
- Settings: automatic install on or off, include beta mods, ReShade version.
- Build from `components/`; every string through i18n; check an empty and a
  loading state; look at it in a sandboxed dev build at a narrow and a wide
  window (the repo rule, which the OptiScaler change did **not** get yet).

## Phases

Each phase is shippable on its own.

0. **Manual proof** (no code). The unknowns above, on Cyberpunk 2077, then
   Fallout 4 (DirectX 11) and Hades II, plus the Ace Combat 8 baseline. Write
   the result into this file.
1. **Groundwork.** Import-table detector, foreign-DLL check, reshade.ini merge
   helper, all with tests. The OptiScaler chooser gets the better detector.
2. **Manual install.** Component model, catalogue, ReShade provider, install and
   remove from a game's options, manifest, setup log entry, our own fixes
   manifest. No automation yet.
3. **Automatic install.** The setup step, "Install in all supported games",
   Update All with per-game exclusions, per-game opt-out, and a notification
   naming the games. Decide whether installing RenoDX should also switch an HDR
   rule on for that game, based on phase 0.
4. **HDR polish.** Ship `hypr-hdr` with Hydra Plus instead of relying on
   `~/.local/bin` (resources folder, like `umu-run`), cover other compositors
   or say plainly that only Hyprland is supported, and take the peak
   brightness from the monitor when known.
5. **More HDR mods.** Generic Unreal (UE-Extended) and Unity add-ons with their
   `Engine.ini` edits, Luma, RenoFX, and a DirectX 9 test to see whether
   Proton's DXVK already covers Lilium's HDR.
6. **ReShade management.** Per-game channels (stable, nightly, custom, legacy),
   the add-on manager, shader packs with per-game selection and profiles, and
   Vulkan games if a ReShade layer turns out to work in a Wine prefix.
7. **Add-ons and engine mods.** ReLimiter and Display Commander, RE Framework,
   and the OptiScaler extras (AMD ini template, OptiPatcher).

Phases 5 to 7 each start with the same hand test as phase 0 for that one
feature; a feature that fails it moves to "Not portable" with the reason.

## Other follow-ups from the same work

- Verify HDR output on screen with a real launch from Hydra (see Findings).
- Make "closes right after starting" say when a second copy of a game is
  already running, if that is what code 3 means. Another change already shows
  a notification for early exits; check what it says first.
- OptiScaler's automatic proxy name: when the wiki and the API detection both
  have nothing, Unity games fall back to `dxgi.dll`. The wiki's Enshrouded page
  also mentions `nvlowlatencyvk-proxy` for Linux, for when no proxy DLL is
  loaded at all; not handled.
- The new OptiScaler select (Automatic, with the wiki or Vulkan reason) has had
  no visual check.
- `lsteamclient=d` has no opt-out. If someone runs a legitimate Steam game with
  Steam open and wants the bridge, a per-game switch would do it. Wait for a
  real request.
- `hypr-hdr` is not in the repo. If it ships (phase 4) it moves in with its
  tests; until then it is documented in the machine's own system-docs.

## Risks

- **Online games.** RenoDX and ReShade can trip anti-cheat. Skip games on the
  OptiScaler "not working" list and anything with a known anti-cheat; say so
  on the game's page.
- **Scope.** RHI is the work of one person over a long time and it ships a
  manifest that is updated daily. Matching all of it is a long road, which is
  why each phase is shippable alone and why the component model comes first.
- **Mod churn.** Add-ons are built nightly and may break after a game update;
  keep the previous add-on so a bad update can be undone.
- **Wine specifics.** Everything above is unverified under Proton until
  phase 0 is done.
- **Data source.** `games-index.json` is RenoDX's own file; if its format
  changes the catalogue must fail closed (install nothing) and say why.

## Decisions for the owner

1. Is phase 0 on Cyberpunk 2077 acceptable, or should it be another game?
2. Beta mods: off by default (recommended) or on?
3. Should phase 4 bundle `hypr-hdr`, or stay a personal script?
4. Is Hyprland-only acceptable for the HDR switch?
5. Phases 5 to 7 are in the order given. Is that the order you want, or is one
   RHI feature (frame limiters, shader packs, Luma) more important to you?
