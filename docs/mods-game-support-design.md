# Mods that work in each game: research

Roadmap phase 19, item 1, written 2026-11-01: what the open-source mod
managers and the mod sites do, read from their sources and APIs. The
decisions and the work built on it are in
[Mods, phase 19](mods-phase-19.md); this file only records the findings.

## What was read

Sources cloned and read on 2026-11-01; APIs called the same day.

| Project                          | Commit (date)        | Licence                              | What it is used for here                         |
| -------------------------------- | -------------------- | ------------------------------------ | ------------------------------------------------ |
| Vortex (`Nexus-Mods/Vortex`)     | 9482caf (2026-10-29) | GPL-3                                | Game extension model, Linux/Proton code          |
| Vortex game extensions           | 18bbee9 (2026-01-21) | GPL-3                                | Per-game facts: Stardew, RimWorld, BG3, Bethesda |
| MO2 `modorganizer-game_bethesda` | a6a2340 (2026-10-06) | GPL-3                                | `plugins.txt` / `loadorder.txt` rules            |
| Limo                             | ffdb4f9 (2025-05-03) | GPL-3                                | The same model on Linux, paths in the prefix     |
| r2modmanPlus                     | b09ec5a (2026-10-28) | MIT                                  | Install rules, loaders, Proton launch            |
| Thunderstore ecosystem schema    | 172a33e (2026-11-01) | none in repo; served by a public API | Per-game data for 372 games                      |
| libloot                          | 34bd01d (2026-10-29) | GPL-3                                | Bethesda load order sorting (later)              |

**Licences.** Hydra Plus is MIT. Code from the GPL-3 projects can't be
copied in without making the fork GPL. Their facts can be used (a game's mod
folder, a file name, a file format, a load-order rule), written in Hydra's
own code and data, with the source named in a comment. r2modman is MIT, so
its code and data can be reused with its copyright notice. The Thunderstore
schema has no licence file; Hydra fetches it from Thunderstore's public API
instead of bundling a copy.

## What each one teaches

**Vortex.** A game extension registers a game (`queryModPath`, executable,
`requiredFiles`, a `setup` step), **installers** (a test on the archive's file
list and a function that returns copy instructions), and **mod types** (a
named target folder plus a test on the instructions). Of its 85 public game
extensions, 19 register mod types and 11 a load order; the rest only say
where mods go and add an installer. So most games need little more than a
game entry.

- **Stardew Valley / SMAPI.** Vortex does not run SMAPI's installer. It
  extracts SMAPI's inner data archive (`linux/install.dat` or
  `windows/install.dat`, a zip) and deploys the result into the game root as
  mod type `SMAPI`, generates `StardewModdingAPI.deps.json` from the game's
  `Stardew Valley.deps.json`, and makes `StardewModdingAPI.exe` the primary
  tool, so the game starts through SMAPI. Missing SMAPI shows "SMAPI is
  required to mod Stardew Valley" with **Get SMAPI** (Nexus mod 2400). After a
  run it can show `SMAPI-latest.txt` / `SMAPI-crash.txt` from
  `AppData/Roaming/StardewValley/ErrorLogs`.
- **RimWorld.** Only a game entry plus an installer that renames a mod's
  folder to its `About/About.xml` `packageId`. Vortex leaves turning mods on
  to the game's own Mods screen.
- **Baldur's Gate 3.** Mods are `.pak` files in
  `AppData/Local/Larian Studios/Baldur's Gate 3/Mods` (outside the game
  folder) and only load when listed in that folder's
  `PlayerProfiles/<profile>/modsettings.lsx`, with each pak's UUID read from
  the pak's own metadata. The extension is about 20 files.
- **Linux.** Vortex's main branch now builds on Linux (install guides for
  Arch, Debian, Fedora, NixOS) and reads Steam's `compatdata/<appid>/pfx` and
  `CompatToolMapping` to find a Proton game's prefix. Worth watching, but it
  only knows Steam's prefixes, not Hydra's.

**Mod Organizer 2.** Bethesda plugin lists, per game family:

- Skyrim SE, Fallout 4, Starfield ("creation" games): one `plugins.txt`,
  every plugin in load order, active ones prefixed with `*`. The game's own
  masters (Skyrim SE: `Skyrim.esm`, `Update.esm`, `Dawnguard.esm`,
  `HearthFires.esm`, `Dragonborn.esm`, plus every Creation Club plugin listed
  in `Skyrim.ccc` in the game folder) always load first and are not written.
- Oblivion, Fallout 3, New Vegas ("gamebryo" games): `plugins.txt` lists only
  active plugins, without `*`, and a separate `loadorder.txt` (UTF-8) lists
  all of them in order.
- Morrowind keeps its list in `Morrowind.ini` (`[Game Files]`), not
  `plugins.txt`.
- MO2's virtual file system stays out (Windows-only; see [Mods](mods-design.md)).

**Limo** (Linux). Each Steam game has a JSON config of **deployers**: a
case-matching deployer per target folder (Skyrim SE: `Data` and the game
root), and a LOOT deployer whose target is the prefix,
`<prefix>/drive_c/users/steamuser/AppData/Local/<Game>` (written as `Local
Settings/Application Data`, the same folder), where `plugins.txt` lives.
**Auto tags** mark mods by path patterns (`*.esp`, `skse/*`). BG3 has its own
deployer that reads pak files. Limo shows that Vortex's model works on Linux
with the files in the prefix; its last commit is from May 2025.

**r2modman / Thunderstore.** The ecosystem data (`schemaVersion` 0.3.0,
served at `https://thunderstore.io/api/experimental/schema/dev/latest/`, 1.8
MB) lists for each of 372 games: Steam app id and other store ids, exe names,
the data folder, the loader (`bepinex` for 270 of them, then MelonLoader,
Shimloader, GDWeave and others), **install rules** (Valheim: `.dll` files go
to `BepInEx/plugins` by default; `BepInEx/core`, `patchers`, `monomod`,
`config` are other routes; each tracked per mod subfolder) and which package
is the loader (`denikson-BepInExPack_Valheim`). On Linux it starts a Proton
game with `WINEDLLOVERRIDES="winhttp=n,b"` (GDWeave: `winmm`) so the
loader's proxy DLL is picked up. Packages are downloaded without a key
(`/api/experimental/package/<ns>/<name>/` gives the latest version, its
download URL and dependencies).

**Prism Launcher** is the interface model, already followed in phase 17.

## Checked against the live APIs (2026-11-01)

- TorBox's hoster list (`https://api.torbox.app/v1/api/webdl/hosters`, no
  sign-in) gives NexusMods `daily_link_limit: 100`, a 10 TB daily bandwidth
  limit and a 100 GB per-file limit. Read signed out; whether the link limit
  depends on the TorBox plan is not known (the owner doesn't remember hitting
  one). Read it with the user's token before relying on it.
- Nexus file content preview:
  `https://file-metadata.nexusmods.com/file/nexus-files-s3-meta/<gameId>/<modId>/<file uri, URL-encoded>.json`
  returns the archive's file tree without a key (the file `uri` comes from
  GraphQL `modFiles`). A mod's full `description` (HTML/BBCode) is in GraphQL
  `mod { description }`, also without a key.

- Thunderstore: schema and package API answer without a key.
- GameBanana `apiv11` search answers without a key.
- Modrinth: project types are `mod`, `modpack`, `resourcepack`, `shader`,
  `plugin`, `datapack`, `minecraft_java_server`: Minecraft only, so it stays
  last.
- Nexus Collections: `collectionsV2` answers without a key with each
  revision's file list (Stardew Valley's most downloaded collection: 104
  files). A collection that size uses 104 of TorBox's 100 Nexus links a day,
  so collection installs must queue across days, show that, and accept
  files the user downloads by hand. Whether the collection's install choices
  (FOMOD options) are readable without a key is still to check.
