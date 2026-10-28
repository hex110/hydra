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

### HDR needs the monitor in HDR before the game starts

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

What is worth taking: Steam-ID matching (better than its name matching), the
ReShade extraction trick, import-table API detection, the foreign-DLL warning
and the backup discipline. What is not: generic Unreal and Unity coverage
(needs per-game `Engine.ini` edits), NVIDIA driver profiles and DLSS
management (this machine is AMD), frame limiters, RE Framework.
**Licence:** Hydra Plus is MIT and RHI is GPL-3.0, so reimplement from the
ideas; do not copy its code or depend on its manifest.

### OptiScaler already knows how to coexist

`OptiScaler.ini` has `LoadReshade`: rename ReShade to `ReShade64.dll`, put it
next to OptiScaler and OptiScaler loads it. That avoids two mods fighting over
`dxgi.dll`, and RHI uses it too.

## Unknowns to settle first (phase 0)

No code until these are answered by hand on a game that is installed here:

1. **Does ReShade with add-ons run under Proton on this machine?** Wine
   overrides: the ReShade DLL natively, plus `d3dcompiler_47` (the existing
   ReShade rule sets both). Check the overlay opens with Home.
2. **Does a RenoDX mod produce HDR on screen?** The one thing nothing has shown
   yet. Use Cyberpunk 2077 (installed, DirectX, stable mod).
3. **Is `hypr-hdr` still needed?** RenoDX upgrades the swapchain itself, but
   Wine may still report no HDR to the game. Try with and without the rule.
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

## Recommended design

Follow the roadmap's rule: anything that copies files into game folders
belongs to Hydra. Copy the OptiScaler feature's shape, because it already
solved the same problems: manifest, backups, opt-out, setup step, per-game
page, update.

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
   Fallout 4 (DirectX 11) and Hades II. Write the result into this file.
1. **Groundwork.** Import-table detector, foreign-DLL check, reshade.ini merge
   helper, all with tests. The OptiScaler chooser gets the better detector.
2. **Manual install.** Catalogue, ReShade provider, install and remove from a
   game's options, manifest, setup log entry. No automation yet.
3. **Automatic install.** The setup step, "Install in all supported games",
   updates, per-game opt-out, and a notification naming the games. Decide
   whether installing RenoDX should also switch the `hypr-hdr` rule on for
   that game, based on phase 0.
4. **HDR polish.** Ship `hypr-hdr` with Hydra Plus instead of relying on
   `~/.local/bin` (resources folder, like `umu-run`), cover other compositors
   or say plainly that only Hyprland is supported, and take the peak
   brightness from the monitor when known.
5. **Later.** Generic Unreal and Unity add-ons with their `Engine.ini` edits,
   a nightly ReShade channel, Vulkan games (a ReShade layer inside a Wine
   prefix is unproven), Luma, DXVK with Lilium HDR for DirectX 9 games,
   shader packs.

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
