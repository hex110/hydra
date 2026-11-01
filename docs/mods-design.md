# Mods: design

Roadmap phase 17, written 2026-11-01. A mod manager inside Hydra for every
game, as smooth as Prism Launcher is for Minecraft, that works on Linux
under Proton and needs no Nexus Mods account.

## What the references do

**Prism Launcher** (Minecraft). Each instance has a **Mods** page: a list of
installed mods with an on/off checkbox, name, version, source and an update
marker; a **Download mods** dialog with source tabs (Modrinth, CurseForge)
that searches, shows a mod's versions filtered to the instance's game
version and loader, and installs the dependencies with it; **Check for
updates** across the list; and the mod's metadata kept next to the file
(packwiz `.pw.toml`) so updates and exports know where it came from. A mod
is a file the game loads from one folder; turning it off renames it.

**Mod Organizer 2.** Every mod lives in its own staging folder; a virtual
file system (USVFS) overlays them on the game folder only for the game's
process, so the game folder stays clean, and the order of the list decides
which mod wins a conflict. Conflicts are shown per file. Profiles are
separate mod lists. Windows-only; under Wine it needs workarounds.

**Vortex** (Nexus). Staging folders too, deployed into the game with hard
links (or symlinks, or a move), purged before changes. Each game has an
extension that says where mods go (`Mods/` for Stardew Valley, the game root
for Cyberpunk 2077, `Data/` for Bethesda games) and how to sort them. The
download button on Nexus's site ("Mod Manager Download") opens an `nxm://`
link.

**Limo** (native Linux). Vortex's model on Linux: staging, deployers (hard
link, symlink, copy, case-matching), Nexus integration with an API key.

**Steam Workshop.** Subscribe on a page; Steam downloads, updates and loads
mods on its own. The bar for "it just works".

## What Hydra does

Vortex's model, with Prism's interface:

- **Staging, then deploy.** A downloaded mod is unpacked into
  `<userData>/mods/<shop>/<objectId>/<modId>/`. Deploying links its files
  into the game folder: hard links when on the same filesystem, copies
  otherwise. Files the mod replaces are moved to a backup first, and a
  manifest records every file, so turning a mod off or removing it puts the
  game back exactly (the OptiScaler and RenoDX installs work the same way).
  A virtual file system was considered: `fuse-overlayfs` could overlay the
  staging folders on the game folder for the game's process only, like
  MO2, but it needs FUSE permissions and a mount per launch, and games that
  write into their own folder would write into the overlay. Links are simple,
  visible and survive without Hydra.
- **Where mods go.** A small table, data like the launch rules, maps games to
  their mod folder (Stardew Valley `Mods`, Bethesda games `Data`, and so
  on); games without an entry use the game root. An archive whose top level
  already starts with the mod folder (`Mods/ContentPatcher/…`) or with
  folders the game root has (`bin/`, `archive/`, `r6/` for Cyberpunk) is
  placed so its paths line up. Windows mods name folders in any case, and
  Linux filesystems are case-sensitive, so deploying matches existing folders
  case-insensitively (`data/` lands in `Data/`).
- **Conflicts.** The list's order decides: a mod lower in the list wins a
  file both ship. The mod row says when it overrides or is overridden.
- **Turning a mod off** undeploys its files and keeps the staging folder, like
  Prism's checkbox. Removing deletes the staging folder too.

### Sources

- **Nexus Mods, browsed without an account.** Nexus's GraphQL API v2
  (`https://api.nexusmods.com/v2/graphql`) answers game, mod and file queries
  without a key (checked 2026-11-01): search a game's mods by name, sort by
  downloads, endorsements or update date, list a mod's files (main, optional,
  old versions) with sizes and dates.
- **Downloads through TorBox.** Nexus only gives download links to its API
  with a key, and fast downloads only to Premium. TorBox's web downloads
  accept a Nexus file page,
  `https://www.nexusmods.com/<game>/mods/<mod>?tab=files&file_id=<file>`,
  fetch it and return a CDN link (checked end to end 2026-11-01 with
  Content Patcher; TorBox allows 100 Nexus links a day). Hydra already
  stores the TorBox token for game downloads.
- **Without TorBox** the install button explains that Nexus downloads go
  through TorBox and opens the file's Nexus page instead; **Install from
  file** takes the archive the user downloaded by hand. Both paths end in the
  same staging and deploy.
- **`nxm://` links.** Nexus's "Mod Manager Download" button opens
  `nxm://<game>/mods/<mod>/files/<file>?key=…`. Hydra can register the
  scheme and turn the link into the file page URL TorBox takes, so the
  button on Nexus's site works too. Later step.
- Wabbajack lists and other sites (ModDB, GameBanana, Thunderstore) come
  later behind the same source interface.

### Matching a game to Nexus

Nexus identifies games by a domain name (`stardewvalley`, `cyberpunk2077`).
Hydra matches the library game's title against Nexus's game list (same
title matching as the catalogue), stores the match on the game, and lets the
user correct it, like the Floppy match.

### Updates and dependencies

A mod remembers its Nexus mod and file id and its version. **Check for
updates** asks for the mod's files: a newer main file is an update, shown on
the row and in the game page's Mods summary. Nexus lists a mod's
requirements (other Nexus mods, and outside tools such as SMAPI or Script
Extender); the install dialog lists them with an install button each, as
Prism does, instead of installing silently: many requirements are not
Nexus files.

## Where it shows (one home per fact)

- **Game page → Mods** (a page like Achievements, `/game/<shop>/<id>/mods`):
  the installed list with on/off, version, update marker and remove; a
  **Browse Nexus Mods** panel with search and sort; a mod's files with
  Install. This is the one home of the mod list.
- **Game page sidebar → Mods**: a `SidebarSection` with the count, how many
  are on and how many have updates, linking to the Mods page.
- **Context menu → Manage → Mods** opens the same page.
- Run records list the deployed mods, so a crash after adding a mod is
  readable by Claude Code like the tools.

## Not in the first version

Load order for Bethesda plugins (`plugins.txt`), profiles (several mod lists
per game), mods in the Wine prefix (`Documents/My Games/...`, AppData),
modpack export, Wabbajack. (FOMOD installers with options came after the
first version: [Mods](features/mods.md).)

## Build order

1. Mod store: staging, manifest, deploy and undeploy with backups,
   case-insensitive paths, conflicts by order. Install from file.
2. Nexus source: game match, search, files; TorBox download into staging.
3. Mods page and sidebar section; updates.
4. `nxm://` handler, requirements, FOMOD defaults, mod folder table growth.
