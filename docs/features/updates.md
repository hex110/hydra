# Game updates

Hydra Plus remembers which release of a game is installed, looks for newer
releases in your download sources and installs an update over the game's
current folder.

## Installed version

Each installed game records the release it came from:

- **Downloaded games:** the release picked in the download dialog (its title,
  source, upload date and links), stored when the download starts and kept
  once the game's executable is found.
- **Scanned and older games:** the name of the game's folder. Release names
  usually carry the version (`Cyberpunk.2077.v2.3-FitGirl`); a folder without
  one still lets Hydra notice later updates from a source by upload date.

The record is made by [game setup](game-setup.md) (its first step) and
refreshed when the game moves to another folder. The game's **Downloads**
options show it.

The game's folder is the download's folder when the executable is inside it,
otherwise the folder directly inside a library folder (or the downloads
folder) that holds the executable, otherwise the executable's folder, followed
up out of Unreal Engine's `Binaries/Win64`.

## Finding updates

With **Settings → Downloads → Look for updates to installed games** on (the
default), Hydra checks every installed game after it starts and after the
download sources sync. **Check for updates** on the Downloads page runs it by
hand and shows when the last check finished.

For each game, Hydra reads the same download list the game page shows (the
server's matches plus [local source matching](local-source-matching.md)) and
picks a newer release:

1. Releases named after neither the installed release nor the game are left
   out (soundtracks, DLC packs).
2. When both names carry a version, the versions are compared part by part
   (`1.10` > `1.9`). Build numbers (`Build 25933619`) are compared when both
   names have one, since they are more precise. Versions from different sources only compare when they have the same
   number of parts: sources number the same game differently
   (`v23350` vs `0.10.35.29104`).
3. When the names cannot be compared, a release from the same source with a
   different name and a later upload date counts as newer: sources replace an
   entry when they publish a new version.
4. Among several newer releases, the installed release's source wins, then
   the highest version, then the latest upload.

Games installed by Epic are never checked against the sources; their launcher
updates them. Games installed through Steam have their own check, see
[Steam games](#steam-games). Repacks show **Installed** and **Update** badges in the download list.

Games with an update are listed under **Needs you** on the Downloads page,
which is the home of that list; the hero's update chip and the home
**Updates available** shelf are summaries that link to it or to the game.
The row's ✕ (**Ignore this version**) hides that release for the game; a
later one is offered again.
A notification is posted when a check finds new updates.

## Installing an update

**Update** opens the game's download dialog with the new release selected and
**Install over the current version** ticked. The checkbox appears for every
installed game, so any release can be installed in place, and can be
unticked to download the release next to the installed one instead.

If the game has [mods](mods.md#when-the-game-updates) in its folder, Hydra
takes them out before the archive is compared and puts them back once the
update is in, so the comparison sees the game's own files and the update
never overwrites a mod.

Tools that put files over the game's own ([OptiScaler](optiscaler.md),
ReShade for [RenoDX](renodx.md), the [widescreen patch](widescreen-patch.md))
are handled the same way:

- the archive is compared with the game files they replaced, which they keep
  in their backup folders, not with their own files;
- right before the files move in, their files go to `.hydra-update-stash/`
  beside them and the game's own files are put back;
- afterwards they are laid back over the new files, and the new files become
  their backups;
- the widescreen patch is made for one game version, so if the update ships a
  file it replaced, Hydra removes the patch instead and the notification says
  to install it again once it supports the new version.

The update dialog says, under **Install over the current version**, what
will be taken out and put back; the update's row in **Needs you** summarises
it. The notification after the update says what was put back or removed.
Nexus mods are checked for updates afterwards, since a new game version
often needs new mod versions.

The download and extraction run as usual, except that Hydra compares the
archive with the installed game first and extracts only the files that are new
or different (size and CRC-32, see
[Extracting over an existing copy](downloads.md#extracting-over-an-existing-copy)).
Space is needed for those files only, not for a second copy of the game. When
the archive can't be compared (no CRCs, encrypted, or the game's executable is
not in it), everything is extracted and merged as before. Then, instead of
looking for an executable:

1. Hydra finds the folder inside the download that matches the installed
   game: the one holding the game's executable at the same relative path,
   searching a few levels deep since releases often wrap the game in an extra
   folder. Failing that, the first folder whose top-level files mostly match
   the installed game's. When only the changed files were extracted this is
   known from the archive, since the executable may be unchanged and absent.
2. The game's saves are backed up with Ludusavi into the game's
   [backups](save-import.md#backups). Games Ludusavi does not know are updated
   without a backup; nothing below touches their saves anyway.
3. Every file of the update (the changed ones, with a delta extraction) is
   moved into the installed folder, replacing the file at the same path. Files only the installed copy has stay: saves and
   configs kept in the game folder. Mods and the tools above are out of the
   folder during this step and are put back after it.
4. The extracted folder is deleted, and the download now points at the
   installed folder.
5. The installed version becomes the new release. If the old executable is
   gone, Hydra looks for the executable again.
6. [Game setup](game-setup.md) runs again with reason `update`, so OnlineFix
   detection and the other steps see the new files. The Wine prefix, launch
   options, launch rule choices and setup state belong to the game record and
   are kept; the post-install command is not run again.

The update is not installed, and the download is left where it was, when:

| Reason                        | What to do                                                                |
| ----------------------------- | ------------------------------------------------------------------------- |
| The game is running           | Close it and extract again from the Downloads page.                       |
| The download is not extracted | Extract it from the Downloads page.                                       |
| The release is an installer   | Run it from the Downloads page and install into the game's folder.        |
| The files do not match        | Pick the new executable in the game's options, or move the files by hand. |
| The game's folder is gone     | Pick the new executable in the game's options.                            |

A notification explains which one happened.

A game whose download is being extracted, or whose update is waiting to be
installed, keeps its executable on record when a library scan finds the files
missing for a moment; the scan used to clear it, and the game then looked
uninstalled until a later scan found it again.

## Steam games

A game installed through Steam (its `appmanifest_<id>.acf` is in a Steam
library) is not looked up in the download sources; Steam holds the update.
Hydra only notices it and has Steam fetch it.

**Finding it** needs no network. Steam's manifest says which build is
installed (`buildid`), the update flags and the branch the game follows
(`UserConfig.BetaKey`, none means `public`); Steam's app cache
(`appcache/appinfo.vdf`) says which build each branch has. A game is behind when
Steam has marked it (`StateFlags` has the update-required bit, or
`TargetBuildID` differs from `buildid`) or when its branch has a newer build in
the cache. The cache only ever hides an update (it is refreshed while Steam
runs), it never invents one. The check runs with the others, five seconds after
a Steam manifest changes and 45 seconds after Steam starts, and is stored on the
game as `steamUpdate`.

It shows where other updates show: **Needs you** on Downloads (status
"Steam build 100 → 200 · public"), the home **Updates available** shelf, the
hero's **Update through Steam** button and the same notification. **Ignore this
version** hides that build. Nothing is listed while Steam is already
downloading the game (its row under **Downloading through Steam** has the
progress), and no notification is sent for it.

**Updating** is Steam's job, so Steam must be open. The button opens
`steam://validate/<appid>`, which makes Steam compare the game's files with its
branch and download the difference. If Steam is closed the header's Steam
button pulses and a dialog offers to start Steam first (Hydra waits up to a
minute for it, then gives Steam a few seconds to settle). Progress is the
existing Steam download watcher
([Steam history](steam-history.md#adding-your-steam-games-to-the-library)).
The code is `main/services/steam-integration/steam-updates.ts` and the pure,
tested parts in `steam-manifest-core.ts`.

## Not yet

Planned as roadmap phase 25 (**Updates that keep what you added**):

- **Installer releases.** A release that is a `setup.exe` (FitGirl, DODI
  and most repacks) is not installed in place: Hydra stops with "The release
  is an installer" and the user runs it into the game's folder by hand. For a
  library of repacks this is the common case.
- **Rollback.** Saves are backed up before an update; the game files it
  replaces are not, so a bad update can only be undone by downloading the
  old release again.
- **Crash recovery.** If Hydra stops in the middle of installing an update,
  tools lifted into `.hydra-update-stash/` stay there; nothing puts them
  back on the next start.
- **Extracting straight into the game folder.** When an update's download
  folder is the game's own folder, changed files are written over the game
  during extraction, before the tools are lifted. A tool file the update
  changed is lost; the widescreen patch is then removed, OptiScaler or
  ReShade is left incomplete (rare: they seldom replace game files).
- **Version matching** is a heuristic over release names. Sources that
  number the same game differently only compare by upload date, so an
  update can be missed or a wrong one offered.
- Games installed by Epic are never checked, on purpose: their launcher
  updates them (Steam games are, see [Steam games](#steam-games)). Mods and tools there are covered only by the
  "replaced outside Hydra" check (see [Mods](mods.md#when-the-game-updates)).

## How it was checked

2026-11-11: mods and tools across an update are covered by unit tests
(`src/main/services/mods/mod-store-game-update.test.ts`,
`src/main/services/game-updates/tool-overlays.test.ts`, the delta and merge
tests). The Downloads update row was looked at in a sandbox at 1400 and
900 px wide. Not checked: a real game update in the app, the line in the
download dialog and the notification text on screen.
