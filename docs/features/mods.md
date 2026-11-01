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

A FOMOD installer archive is installed as packed and marked **FOMOD**; its
options are not offered yet.

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

## Not yet

`nxm://` links from Nexus's "Mod Manager Download" button, requirements,
FOMOD options, Bethesda plugin load order, profiles, mods in the Wine prefix
(`Documents/My Games`), Wabbajack and other sites. See the design's build
order.
