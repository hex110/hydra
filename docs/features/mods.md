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

## Nexus Mods

Browsed through Nexus's public GraphQL API (`api.nexusmods.com/v2/graphql`),
which needs no account: the game is matched by title on first open (**Wrong
game?** picks another), mods are searched and sorted by downloads,
endorsements or update date, adult mods are left out, and a mod's main,
optional, update and miscellaneous files are listed newest first.

Downloads go through **TorBox**: Hydra sends the file's Nexus page to
TorBox's web downloads, waits for TorBox to fetch it, and downloads the
result from TorBox's CDN. It uses the TorBox token from **Settings →
Integrations**; TorBox allows 100 Nexus links a day. Without a token the
page says so, and each file offers **Open on Nexus Mods** instead, for a
manual download and **Install from file**.

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

Loaders, load order, the game's own mod list, files in the Wine prefix, more
sources and modpacks: roadmap phase 19, planned in
[Mods, phase 19](../mods-phase-19.md).
