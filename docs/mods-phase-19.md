# Mods, phase 19: spec and plan

Written 2026-11-01 with the owner. This is the document to start from when
implementing roadmap phase 19 (**Mods that work in each game**). It says what
to build, in which order, what the owner decided, and how to check each step.

- What exists already: [Mods](features/mods.md) (the feature as shipped in
  phase 17) and [Mods: design](mods-design.md) (phase 17's design).
- Why the decisions below are what they are: [Mods: research](mods-game-support-design.md)
  (what Vortex, MO2, Limo, r2modman and the mod sites do, with commits and
  API checks).

## Goal

Phase 17 puts a mod's files in the right folder. For many games that is not
enough: the game needs a loader, its own list of active mods, files in the
Wine prefix, or a load order, and without them the files sit there unused.
Phase 19 makes mods actually work, game by game, for a user **without a Nexus
account or Premium**, and makes the whole thing part of Hydra rather than a
page bolted on.

The owner's bar: the modding part should be easy to try things in, outside a
Claude Code session: install, play modded, see what happened and why, and
hand a complete report to Claude Code afterwards.

## Owner decisions (2026-11-01)

1. **Loaders are automatic.** When a game has a loader installed, Play starts
   the game through it. The Play button becomes **Play (modded)** with a
   dropdown on its right side offering **Play** and **Play (modded)**; the
   selected one has a checkmark and is the default for that game until
   changed.
2. **Load order:** run **LOOT** to sort plugins for the games LOOT supports,
   and keep a **manual order** too. Beyond Bethesda games, a **generic
   dependency order**: mods that others depend on load first, from whatever
   source knows (LOOT where relevant, Nexus requirements, Thunderstore
   dependencies, a mod's own manifest).
3. **Downloads without Nexus Premium:** Thunderstore comes before Nexus
   Collections. For Nexus, TorBox's link limit is shown plainly; TorBox
   fetches files above a size threshold (default 100 MB), and the user
   downloads the rest from Nexus by hand, Prism-style: Hydra opens each file's
   page, the user clicks download, and Hydra picks the files up from the
   Downloads folder.
4. **Install knowledge in layers:** game definitions, then the archive's own
   clues, then (optional) an AI reading the mod's description, then a shared
   database of approved install plans.
5. **Integration first.** Before the deep work on TorBox, Nexus and install
   rules, make modding a connected part of Hydra: consistent UI, clear states,
   downloads in the Downloads queue, mods in run records, and logs the owner
   can read and send to Claude Code.

## Work, in order

Each step lands on its own, with docs, and is checked as described under
[Checking](#checking). Roadmap phase 19 lists the same steps.

### Step 2. Modding as part of Hydra

The groundwork the owner tests everything else with.

**Activity log per game.** Every mod action for a game is appended, one JSON
line each, to `<userData>/mods/<shop>/<objectId>/activity.jsonl`: download
requested (source, mod and file ids, TorBox request id; never tokens or
signed URLs), download finished or failed (size, time, error), install plan
(each archive path → target path, which rule chose it: game definition,
FOMOD, layout guess, AI plan), deploy and undeploy (files linked, copied,
backed up), conflicts, loader changes, enable-list writes, load-order
changes and why, errors with their message. The existing `logger` lines stay;
this is the per-game record a person reads.

- **Mods page → Activity** (a tab next to the installed list): the log,
  newest first, filterable by mod, errors highlighted.
- **Copy report** (on the Activity tab and on a failed run): one Markdown
  block with the game (title, shop, id, exe, Proton build, prefix), its
  support definition and where it came from, the mod list with order, on/off,
  versions and sources, the loader, the deployed manifest summary, the last
  run's outcome, the loader's log lines that mention errors, and the last 200
  activity lines. Meant to be pasted into Claude Code. **Save report** writes
  the same to a file and shows it in the folder.
- **Open folders:** the staging folder, the game's mod folder and, when
  there is one, the prefix target, from the Mods page's menu.

**Play (modded).** The game page's Play button
(`pages/game-details/hero/hero-panel-actions.tsx`) becomes a split button
when the game has mods on or a loader: the main part says **Play (modded)**
or **Play**, the arrow opens a menu with both, the current default ticked.
The choice is stored per game. **Play** undeploys nothing: it starts the
game's own exe without the loader and without mod DLL overrides, so for
games whose mods are plain files it is "Play with mods present but no
loader". Say so in the menu item's hint. A split-button primitive does not
exist: add it to `src/renderer/src/components/` first (the UI rules in
`CLAUDE.md`). The context menu's Play and Big Picture follow the same
default.

**Run records.** Each run records whether it was modded, the loader and its
version, and the mods that were deployed (name, version, source). Shown in
**Options → Compatibility → Runs** with the rest of the run. Phase 17's design
promised this and it was not built.

**Mod downloads in the Downloads queue.** Today a Nexus file downloads inside
the Mods page (`services/mods/mods.ts`, progress only on the row). Put mod
downloads in the Downloads page and the bottom bar like game downloads, with
their own states: **Waiting for TorBox**, **Downloading**, **Waiting for
you** (manual download, see step 8), **Installing**, **Failed** with the
reason and **Retry**. Leaving the Mods page must not lose a download.

**States everywhere.** Every mod surface has an empty, a loading and an error
state, and a game Hydra can't mod says why in one line: no executable set,
game never started (no prefix), game running, no support definition ("Hydra
places files in `<folder>`; it doesn't know this game's loader or mod
list").

**Settings → Mods** (a group in Settings): TorBox status and the size
threshold, the watched Downloads folder, LOOT (installed or not, download),
the optional AI provider, and where mods are stored with its disk use.

**Before the first modded launch**, if save backups are set up, offer one
backup of the game's saves ("Mods can change saves"), once per game.

**As built (2026-11-04).** All of the above, with these choices: the Play
menu's hint says Play skips only the loader (the open question's second
answer; undeploying for Play stays possible later). Settings → Mods shows
TorBox (with the daily Nexus links left, read now rather than in step 8), the
Nexus button handler and storage; the threshold, watched folder, LOOT and AI
provider settings come with steps 8, 5 and 9. **Waiting for you** exists as a
download state but nothing enters it before step 8. Details and what was
checked: [Mods](features/mods.md).

### Step 3. Game support definitions

One definition per game in `src/main/services/mods/games/`, data plus small
functions only where needed:

```ts
interface GameSupport {
  /** Matches the library game: Steam app ids, Nexus domain, exe names. */
  match: { steamAppIds?: string[]; nexusDomain?: string; exeNames?: string[] };
  /** Named targets; "game:<path>" is in the game folder, "prefix:<path>" in the Wine prefix. */
  modTypes: ModTypeRule[]; // target, how a mod's files are recognised, default
  loader?: LoaderSupport; // which mod is the loader, how it installs and starts
  enableList?: EnableListWriter; // plugins.txt, modsettings.lsx, ModsConfig.xml
  loadOrder?: "loot" | "dependencies" | "none";
  logs?: LogRule[]; // where the loader writes, how to read success and failure
  source: string; // where the facts came from (project, commit)
}
```

- **Thunderstore games** come from Thunderstore's ecosystem data
  (`https://thunderstore.io/api/experimental/schema/dev/latest/`, fetched
  and cached, refreshed weekly, never bundled: no licence file). Each game's
  `packageLoader` and `installRules` become a definition: 372 games.
- **Nexus games** are written by hand from the research facts, each naming
  its source. GPL projects' code is not copied, only facts.
- `MOD_FOLDERS` in `src/shared/mods.ts` becomes the fallback for games
  without a definition, not a second system.
- First game: **Valheim** (BepInEx, Thunderstore, no account needed).

### Step 4. Loaders, automatic

A loader is installed as a mod flagged as the game's loader, so deploy,
backups and undo already cover it. Missing loader: one row at the top of the
installed list, "<Loader> is needed for mods to load", with **Install**;
installing a mod that needs it installs it too.

| Loader                                     | Installed by                                                                                                               | Started by                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| BepInEx / MelonLoader                      | the Thunderstore loader package into the game root                                                                         | `WINEDLLOVERRIDES` `winhttp=n,b` (MelonLoader also `version`) |
| SMAPI                                      | extracting `windows/install.dat` into the game root, writing `StardewModdingAPI.deps.json` from `Stardew Valley.deps.json` | `StardewModdingAPI.exe` instead of the game's exe             |
| Script extenders (SKSE, F4SE, xNVSE, OBSE) | the release archive into the game root                                                                                     | the loader exe (`skse64_loader.exe` …)                        |
| REFramework                                | `dinput8.dll` into the game root                                                                                           | `dinput8=n,b`                                                 |

- Starting through a loader is a launch-time override, never a change to the
  game's stored executable (decision 1's dropdown switches it).
- DLL overrides go through `buildLaunchEnvironment`
  (`src/main/helpers/launch-environment.ts`, called from
  `launch-additions.ts` next to OptiScaler's and RenoDX's).
- **New: a proxy DLL clash check.** Two tools needing the same DLL name
  (OptiScaler as `winhttp.dll` and BepInEx) are refused with a reason before
  deploying. Cover OptiScaler, RenoDX/ReShade and OnlineFix too. No such
  check exists today.
- Loader sources: Thunderstore packages directly; SMAPI and script extenders
  from their GitHub releases where published, else Nexus like any mod.

### Step 5. Load order and the game's own list

Written into the prefix on every deploy, so profiles switch it too.

- **Creation games** (Skyrim SE, Fallout 4, Starfield):
  `<prefix>/drive_c/users/steamuser/AppData/Local/<Game>/plugins.txt`, every
  plugin in order, active ones prefixed `*`; the base masters and the
  plugins listed in the game folder's `.ccc` file load implicitly and are
  left out. **Gamebryo games** (Oblivion, Fallout 3, New Vegas):
  `plugins.txt` with only active plugins, plus `loadorder.txt` (UTF-8) with
  all. Morrowind: `[Game Files]` in `Morrowind.ini`.
- **Plugins view** on the Mods page for these games: drag to reorder, masters
  pinned first, **Sort with LOOT**.
- **LOOT**: libloot and LOOT are GPL-3, so Hydra runs LOOT as a separate
  download, not linked in. Check how to run it headless (LOOT has no
  documented CLI; libloot has Python bindings). Check the masterlist's
  licence. LOOT's sort is shown as a proposed order the user applies.
- **Generic dependency order** for every other game: a mod that others
  depend on deploys first (loses conflicts to its dependents). Sources: Nexus
  requirements (already stored per mod), Thunderstore `dependencies`, a
  mod's own manifest (SMAPI `manifest.json` `Dependencies`, RimWorld
  `About.xml` `modDependencies` / `loadAfter`). Shown as **Sort by
  dependencies**, proposed, then applied; manual order always wins after.
- **Baldur's Gate 3**: `.pak` mods deploy to
  `AppData/Local/Larian Studios/Baldur's Gate 3/Mods` in the prefix and are
  listed in `PlayerProfiles/<profile>/modsettings.lsx` with each pak's UUID
  read from the pak's metadata.
- **RimWorld**: at first, say where to turn mods on in the game; writing
  `ModsConfig.xml` later.

### Step 6. Files in the Wine prefix

A mod type target `prefix:<path>` resolves through `Wine.resolvePrefixPath`
as launch does; deploying there uses the same links, backups and manifest. A
game whose prefix doesn't exist yet says "Start the game once so Hydra can
place these files".

### Step 7. Did it load

After a run of a game with `logs` rules, read the loader's log and record
loaded, failed and skipped mods in the run record and the activity log; a
mod that failed shows it on its row with the log line.

- SMAPI: `<prefix>/drive_c/users/steamuser/AppData/Roaming/StardewValley/ErrorLogs/SMAPI-latest.txt`
  (and `SMAPI-crash.txt`).
- BepInEx: `BepInEx/LogOutput.log` in the game folder.
- Script extenders: their log under `Documents/My Games/<Game>/` in the
  prefix.

### Step 8. Downloads without Nexus Premium

- **TorBox for big files.** Files at or above the threshold (Settings → Mods,
  default 100 MB) go through TorBox (`services/mods/torbox-nexus.ts`).
- **The limit, shown.** Read TorBox's hosters list with the user's token
  (`GET /v1/api/webdl/hosters`, `daily_link_limit` and `daily_link_used` for
  NexusMods) and show "TorBox: N of M Nexus downloads left today" where
  installs start. Signed out of TorBox it read 100 a day on 2026-11-01; it may
  depend on the plan, so always read it, never hard-code it.
- **Manual queue, Prism-style.** Files under the threshold, or when TorBox
  is out of links or not set up, go to **Waiting for you**: Hydra lists them,
  opens each file's Nexus page (`?tab=files&file_id=…`) in the browser one
  at a time or all at once, and watches the Downloads folder (Settings →
  Mods; default `xdg-user-dir DOWNLOAD`). A file whose name matches the
  expected name (GraphQL `modFiles.uri`) and size is moved into the mod's
  download folder and installed. Files that don't match are left alone.
- `nxm://` links (already handled) feed the same queue.

### Step 9. Install knowledge in layers

1. **Game definition** (steps 3–6).
2. **The archive's own clues:** Nexus's content preview gives the file tree
   before downloading (see research); FOMOD; the mod's metadata files (SMAPI
   `manifest.json`, RimWorld `About/About.xml`, Thunderstore
   `manifest.json`). Use the preview to plan before spending a TorBox link,
   and to warn about mods Hydra can't place (an `.exe` installer, a patcher
   to run).
3. **AI reading the description**, optional, only when 1 and 2 leave the
   placement unclear. Input: the mod's description (GraphQL `mod {
description }`), the file tree, the game's definition. Output: a
   structured plan (archive path → target, required loaders and mods, notes
   such as "edit this INI") that is validated against the file tree and
   **shown to the user before anything is installed**. It only places files;
   it never runs anything from the mod. Needs a provider set in Settings →
   Mods (an API key, or a local model); without one, Hydra says the mod needs
   manual placement and shows the description. The laptop (MX550, 8 GB) can't
   run a useful local model, so the key path matters.
4. **Shared install plans.** Plans the user approved can be shared to a
   public database (like umu-database for Proton fixes) keyed by Nexus game,
   mod and file id, so a mod is worked out once for everyone. Needs a home
   (a GitHub repo of JSON files is enough to start) and an owner decision on
   hosting before it is built.

### Step 10. More sources

Behind one source interface (search, versions, files, dependencies,
download): **Thunderstore** first (no key, exact dependencies, 372 games),
then **GameBanana** (open API) and **ModDB**. **Modrinth** is Minecraft-only
(checked 2026-11-01) and stays last. CurseForge and mod.io need an API key
granted to the app: ask the owner first.

### Step 11. Modpacks

Import **Thunderstore profile codes** and packs first, then **Nexus
Collections** (`collectionsV2` lists a revision's files without a key; large
ones go through step 8's manual queue and the TorBox limit), Modrinth packs
last. **Export a profile** as a pack other Hydra Plus users can import.

### Step 12. Prism's comforts

A mod's details page (description, changelog, files, requirements), **Update
all**, requirements installed with the mod (with the choice shown), and
filtering files by game version where the source knows it.

## Checking

**Sandbox.** Never test against the real library or `~/.config/hydra-plus`.
Run a dev instance with its own user data and a scratch Downloads folder:

```
env WAYLAND_DISPLAY=wayland-1 DISPLAY=:0 MAIN_VITE_USER_DATA_PATH=<sandbox> \
  npx electron-vite dev --remoteDebuggingPort <port> --inspect <port2>
```

(The Bash tool has no display variables; set them as above.) The `CLAUDE.md`
"Dev testing" rules apply (signed-out copy, kill by PID, no `pkill -f`).

**Driving it.** `scripts/dev/cdp.mjs <port> <out.png|-> [js] [w h]` evaluates
JavaScript in the renderer and takes screenshots; `scripts/dev/main-eval.mjs
<inspectPort> <js>` evaluates in the main process (used to stub
`dialog.showOpenDialog` for **Install from file**). Both need the ports
above.

**Fixtures.** A fake game folder is enough for placement, deploy, order and
enable-list tests: an empty folder with the game's exe name and the folders
its mods expect, added to the sandbox library. Real games are needed for
"did it load" and loaders: Valheim (BepInEx) and Stardew Valley (SMAPI) are
the first. A FOMOD test archive is easy to build by hand (see
`services/mods/fomod.test.ts`).

**Per step:** typecheck, the tests for the code touched
(`node --import ./scripts/register-ts-node.mjs --test <file>`), a visual
check at a narrow and a wide window, and for steps 4–7 one real game under
Proton. Write in the step's feature doc what was checked and how.

**Machines.** The owner tests on `hp-laptop-ari` (CachyOS, MX550, 8 GB,
reached with `tailscale ssh ari@hp-laptop-ari`) as well as the desktop. The
product principles want each step to work signed out on that laptop.

## Where things are today

- Main process: `src/main/services/mods/` — `mod-store.ts` (staging, deploy,
  backups, profiles, FOMOD pending), `mods.ts` (Nexus install flow with
  TorBox), `nexus.ts` (GraphQL), `torbox-nexus.ts`, `nxm.ts`, `fomod.ts`;
  events in `src/main/events/mods/index.ts`.
- Shared logic and tests: `src/shared/mods.ts` (`MOD_FOLDERS`,
  `resolveModLayout`, `planDeployment`, profiles), `src/shared/fomod.ts`.
- Renderer: `src/renderer/src/pages/mods/` (`mods.tsx`, `nexus-browser.tsx`,
  `fomod-wizard.tsx`, `mod-profiles.tsx`); the game page sidebar summary in
  `pages/game-details/sidebar/mods-section.tsx`.
- Launch: `src/main/helpers/launch-additions.ts` and
  `launch-environment.ts`; run records in `src/main/services/game-runs/`.
- Fact ownership: the table in `docs/features/game-page.md`. The mod list,
  loader, plugins and activity live on the Mods page; the run's mod details
  live in Runs. Add rows there for anything new.

## Open questions

Ask the owner when the step gets there; don't block earlier steps on them.

- **Plain Play for games whose mods are plain files** (Cyberpunk
  `archive/`, Bethesda `Data/` with `plugins.txt`): without a loader to skip,
  Play still loads them. Undeploy for Play (slow on big lists), or say in the
  menu that it only skips the loader? (Step 2.) Built as "say so" for now;
  confirm with the owner.
- **AI provider** for step 9: which ones (Anthropic, OpenAI-compatible,
  Ollama), and whether Hydra may send a mod's description and file list to
  it by default once a key is set.
- **Shared install plans** (step 9.4): where they are hosted and who reviews
  them.
- **LOOT headless** (step 5): if LOOT can't be run without its window, use
  libloot through a small separate helper, or open LOOT for the user.
