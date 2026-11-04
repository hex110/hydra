# Mods

A mod manager for every game, modelled on Prism Launcher's mods page and
Vortex's deployment. The reasoning is in the [design](../mods-design.md).

## Where

- **Mods page** (`/mods?shop=…&objectId=…&title=…`): the installed list and
  the Nexus Mods browser. Opened from the game page's **Mods** sidebar
  section, or **Manage game → Mods** in a game's context menu (custom games
  have no sidebar). Needs the game's executable: mods go into its folder.
- **Mods** sidebar section on the game page: how many mods, how many are on,
  how many have updates.
- **Settings → Mods**: whether TorBox is set up and how many Nexus downloads
  it has left today (read from TorBox's hosters list, never assumed), whether
  Hydra handles Nexus's Mod Manager Download buttons, and how much disk the
  mod store uses, with **Open folder**.

The Mods page says what Hydra knows about the game in one line, with where
the facts came from on hover: its support definition ("Castlevania: Belmont's
Curse, from Hydra's own game list: loose mod files go into `BepInEx/plugins`
and load through BepInEx 6 (IL2CPP)"), or without one, "Hydra places files in
`<folder>`; it doesn't know this game's loader or mod list yet", naming
whether the folder came from the mod folder table or is the game folder.
While the game runs the list is read-only and says why. Every part has a
loading and an error state.

## Game support definitions

A definition says how a game is modded: which games it matches (Steam app
id, Nexus domain, exe name), its mod types (a folder in the game, the file
extensions that go there, which is the default, and whether a mod's loose
files get a folder of their own), its loader and where its facts came from.
Hydra picks the most specific one (`services/mods/games/`):

1. **Hydra's own list**, `HYDRA_GAME_SUPPORT` in `src/shared/mod-games.ts`,
   written by hand with a source per game. First entry: Castlevania:
   Belmont's Curse (BepInEx 6.0.0-be.788, the build its Nexus mods are made
   for).
2. **Thunderstore's game list**: the ecosystem schema
   (`thunderstore.io/api/experimental/schema/dev/latest/`), fetched on first
   use, turned into definitions and cached in
   `<userData>/mods/thunderstore-games.json`, refreshed weekly. No copy is
   bundled (the schema has no licence). 376 games on 2026-11-04, Valheim
   among them; a game whose loader Hydra can't install yet (Shimloader,
   GDWeave, …) says so.
3. The **mod folder table** (`MOD_FOLDERS`, the fallback that existed
   before): Stardew Valley, Bethesda games and the rest keep their folder.
4. **Its game files**: a Unity game (`UnityPlayer.dll` or `<exe>_Data`) takes
   BepInEx, 6 (IL2CPP, when `GameAssembly.dll` is there) or 5 (Mono).

With a definition, an archive is placed by `planModPlacement`: an archive
that ships the loader is laid out like the game folder, from inside the
folder around it (a Thunderstore pack's `BepInExPack_Valheim/`; the
manifest, icon and readme beside it are left out); an archive with a folder
the game or a mod type has (`BepInEx/…`), or a file that replaces one of the
game's own, is laid out like the game folder; anything else is routed, a top
folder named like a mod type's (`plugins/`, `config/`) going there, a file
with a mod type's extension (`.dll`) going there, the rest to the default
type, in a folder named after the mod (`BepInEx/plugins/<mod>/`), as
r2modman does. The activity log's install plan names the definition and its
source. Games without a definition are placed as before.

## Loaders

A loader is a mod: installing it deploys, backs up and undoes like any other,
it goes first in the list so the mods after it win the files they share, and
its row says **Loader**. Hydra recognises one by its files wherever it comes
from (its own download, a Nexus "BepInEx included" file, an archive from
disk): BepInEx by `BepInEx/core/BepInEx*.dll`, MelonLoader by
`MelonLoader/…/MelonLoader.dll`, with the proxy DLL it ships at the top
(`winhttp.dll`, `version.dll`).

- **Where it comes from:** the definition's loader package. BepInEx 6
  bleeding-edge builds from `builds.bepinex.dev`, BepInEx 5 from its GitHub
  releases, and for Thunderstore games the community's most downloaded
  loader package from Thunderstore (no account). Loader downloads are in the
  Downloads queue like Nexus files.
- **When:** installing a mod whose files go into the loader's folders
  (`BepInEx/…`) queues the loader too, unless one is installed (an installed
  loader turned off counts: the user turned it off). A game whose definition
  has a loader that isn't on shows one row above the list, "<Loader> is
  needed for mods to load", with **Install**, or **Turn on** when it is only
  off.
- **Starting it:** Play (modded) adds the loader's proxy DLLs to
  `WINEDLLOVERRIDES` (`winhttp=n,b`) next to OptiScaler's and RenoDX's;
  Play leaves them out, so Wine loads its own `winhttp.dll` and BepInEx
  doesn't start. The game's stored executable never changes. The run record
  and the mods report name the loader and its version.
- **Proxy DLL clash:** a loader whose proxy DLL OptiScaler, ReShade (RenoDX)
  or OnlineFix already uses in the game is refused before it is deployed,
  installed or turned on, and the activity log says which tool and DLL. The
  other way round, OptiScaler already skips DLL names the game folder holds.

Not yet: loaders that start through their own exe (SMAPI, script extenders)
or `dinput8.dll` (REFramework), and 32-bit Unity games (Hydra installs the
x64 BepInEx).

## Play (modded)

A game with mods on gets a split Play button: the main part runs the
current choice, **Play (modded)** or **Play**, and the arrow opens both, the
default ticked and each with a line on what it does. Picking one launches it
and makes it the game's default (stored in `mods.json`, logged). The context
menu's Play and Big Picture follow the default, since the launch reads it.
**Play** skips the loader and loader DLL overrides only; it doesn't undeploy,
so mods that are plain files still load, and the menu says so. Until loaders
exist (phase 19 step 4) the two start the game the same way, and only the run
record tells them apart.

The first **Play (modded)** of a game whose saves are backed up by save sync
asks once: "Mods can change saves", **Back up and play** or **Play without a
backup**. A failed backup doesn't start the game.

## Installed mods

Each mod is unpacked into `<userData>/mods/<shop>/<objectId>/staging/<id>/`
and linked into the game folder: hard links, or copies when the staging
folder is on another filesystem. A file a mod replaces is moved to
`…/backup/` first. `deployed.json` records every deployed file, so turning a
mod off, removing it, or changing the order takes everything out and puts the
game's own files back before deploying again. Folders that already exist are
matched whatever their case (`data/` from a Windows archive lands in `Data/`).

- **On/off** keeps the staged files and only changes what is deployed.
- **Order:** when two mods ship the same file, the one lower in the list wins;
  the row of the losing mod says how many of its files are replaced.
- **Check for updates** compares each Nexus mod's installed file with its
  newest main file; **Update to …** installs it in the mod's place.
- **Install from file** takes an archive (zip, 7z, rar) or a single file the
  user downloaded.
- Each row says where the mod came from: **Nexus Mods**, **File**, or
  **Web** (a loader Hydra downloaded from where it is published).
- Changes are refused while the game runs.

Where a mod goes: `MOD_FOLDERS` in `src/shared/mods.ts` maps Nexus game
domains to their mod folder (Stardew Valley `Mods`, Bethesda games `Data`);
other games take mods in their own folder. `resolveModLayout` lines up
archives packed with or without the mod folder, in a wrapper folder, or
mirroring the game folder.

**Requirements.** Opening a Nexus mod lists what its page says it requires
(read from the same keyless API): a requirement that is installed says so, a
Nexus mod for the same game has **Find** (searches for it), and an outside
tool or another game's mod has **Open page**. Installing a Nexus file stores
its requirements with the mod, and an installed row says **Needs …** while a
required Nexus mod is not in the list. Nothing is installed by itself: many
requirements are tools with their own installer (SMAPI, Script Extender), so
the hint says to ignore it when that is the case.

**FOMOD installers.** An archive with `fomod/ModuleConfig.xml` (UTF-8 or
UTF-16) is unpacked into `…/pending/<id>/` and waits for options: the
installer opens at once when the Mods page is open, and otherwise the
installed list shows the archive as **Installer waiting for your options**
with **Choose options** and **Discard** (so a Mod Manager Download from Nexus
waits there too). The installer shows the FOMOD's pages in order, skipping
pages whose conditions the earlier choices don't meet; each group says how
many options it takes (pick one, pick any, all included…), required and
recommended options start ticked, an option an earlier pick rules out is
greyed as **not usable**, and pointing at an option shows its picture and
description. **Install** copies the required files, the picked options' files
and the conditional files whose flags hold (higher `priority` wins) into the
mod's staging folder, matching the archive's folder names whatever their
case, and deploys it into the game's mod folder (`Data` for Bethesda games).
**Later** keeps it waiting. The logic lives in `src/shared/fomod.ts` (shared by
the installer window and the install), the XML parsing in
`services/mods/fomod.ts`; both are tested. Not evaluated: conditions on other
mods' plugin files (only "missing" can be known) and game version checks
(taken as met). Mods installed before this, as packed, still carry the old
**FOMOD** mark.

## Activity and reports

Every mod action is appended to the game's
`<userData>/mods/<shop>/<objectId>/activity.jsonl`, one JSON line each:
downloads requested, finished and failed (source, mod and file ids, TorBox's
request id, size, time, error; never tokens or signed links), the install plan
(each archive path and where it lands, and the rule that chose it: layout
guess or FOMOD), what was deployed and undeployed (hard links, copies, files
backed up), conflicts, turning mods on and off, moves, removals, profiles,
the Nexus match, the Play setting, modded launches, the save backup offer and
errors. The log keeps its newest 3,000 lines once it passes 2 MB.

- **Mods page → Activity**: the log, newest first, filterable by mod or to
  errors only, errors marked; **Details** shows an entry's data.
- **Copy mods report** (the Mods page's **⋯** menu, and on a failed modded run
  in Runs): one Markdown block for Claude Code or a bug report, with the game
  (exe, Proton, prefix, Nexus match), what Hydra knows about it, the Play
  setting and loader, the mod list in order with on/off, versions, sources and
  conflicts, the deployed summary, the last run, the loader's error lines, and
  the last 200 activity lines. **Save mods report** writes it to
  `…/reports/` and shows it in the file manager.
- The same menu opens the game's mod folder, the staged mods and the game's
  mod store.

## Nexus Mods

Browsed through Nexus's public GraphQL API (`api.nexusmods.com/v2/graphql`),
which needs no account: the game is matched by title on first open (**Wrong
game?** picks another), mods are searched and sorted by downloads,
endorsements or update date, adult mods are left out, and a mod's main,
optional, update and miscellaneous files are listed newest first.

Downloads go through **TorBox**: Hydra sends the file's Nexus page to
TorBox's web downloads, waits for TorBox to fetch it, and downloads the
result from TorBox's CDN. It uses the TorBox token from **Settings →
Integrations**; TorBox limits Nexus links per day (100 when checked), and
Settings → Mods shows what is left. **Install** queues the file in the
Downloads page ([Mod downloads](downloads.md#mod-downloads)); the file's
button shows its state meanwhile. Without a token the page says so, and each
file offers **Open on Nexus Mods** instead, for a manual download and
**Install from file**.

## Nexus's Mod Manager Download button

Nexus's own download button opens `nxm://<game>/mods/<mod>/files/<file>`.
With **Use Hydra for those buttons** on the Mods page (shown until Hydra is
the handler), Hydra installs the file into the library game it belongs to:
the game whose stored Nexus match has that domain, else the one game whose
title matches, and opens its Mods page while TorBox fetches the file. A
desktop notification says when it is done, or that no game matched. The
desktop file declares `x-scheme-handler/nxm`; the button sets Hydra as the
default (`xdg-mime`), so another mod manager keeps the links until then.

## Profiles

**New profile** above the installed list saves the list as it is now (which
mods are on, in which order) under a name and makes it active; the first one
also keeps the list as it was, as **Default**. From then on every change
(turning a mod on or off, moving it, installing or removing one) is saved into
the active profile. Picking another profile in **Profile** redeploys the game
folder with that profile's list. Mods are installed once and shared by all
profiles: a mod installed while another profile is active shows up off and at
the end of the list. **Delete profile** removes the active one and switches
to the first left; the mods themselves stay installed. Profiles are kept in
the game's `mods.json`.

## Not yet

Exe and `dinput8` loaders, load order, the game's own mod list, files in the
Wine prefix, reading the loader's log, more sources and modpacks: roadmap
phase 19, planned in
[Mods, phase 19](../mods-phase-19.md). Settings → Mods has no download size
threshold, watched Downloads folder, LOOT or AI provider yet: each comes with
the step that uses it (8, 5, 9), so no setting is shown that does nothing.

## How step 2 was checked

2026-11-04, in a signed-out sandbox (fresh user data, `HOME` pointed at a
scratch folder) with a fake Stardew Valley folder: two zip fixtures that ship
the same file installed through a stubbed file dialog (hard links, one
conflict, activity lines for plan, deploy, undeploy, conflict and install);
the Activity tab and the split Play menu at 900 and 1600 px wide; a launch
through a native stand-in script exiting with code 3 (the run record and
`summary.md` list both mods, the Mods page shows the game as running, the
failed run offers Copy mods report); a Nexus install with a fake TorBox token
(a failed row in Downloads with TorBox's message and Retry, no token in the
log); Settings → Mods; the report text. Not checked: a real TorBox download,
the save backup offer with save sync set up, a Windows game under Proton.

## How steps 3 and 4 were checked

2026-11-04, in a signed-out sandbox with a reflinked copy of the owner's
Castlevania: Belmont's Curse (AnkerGames build, Unity IL2CPP) added as Steam
4231820:

- The definition matched (Hydra's list); installing the ultrawide fix's
  plugin-only zip (ollieatkinson v2.0.3) placed `BepInEx/plugins/…` as packed
  and queued BepInEx 6.0.0-be.788 from builds.bepinex.dev in Downloads, which
  installed first in the list (228 files, recognised as the loader through
  `winhttp.dll`); 231 hard links deployed.
- The launch preview had `winhttp=n,b` for Play (modded) and not for Play.
- **Play (modded) under Proton** (umu): BepInEx generated its interop
  assemblies, `LogOutput.log` said "Loading [Belmont's Curse Ultrawide
  2.0.3]" and the plugin "Ultrawide fixes loaded for 3440x1440; 12/12
  features enabled". The run's `summary.md` named the loader and both mods.
- With the loader turned off the "is needed" row offered **Turn on**, which
  turned it on without downloading it again.
- A fake Valheim folder (Steam 892970) matched Thunderstore's definition;
  **Install** fetched `denikson-BepInExPack_Valheim` 5.4.2360 from
  Thunderstore and left the pack's manifest and icon out.
- The Mods page at 900 and 1600 px wide.

Not checked: the proxy DLL clash with a real OptiScaler install (covered by
unit tests), MelonLoader, a Mono game, Nexus files through TorBox for these
games.
