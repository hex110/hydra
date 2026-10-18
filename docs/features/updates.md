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
hand.

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

Games installed by Steam or Epic are never checked; their launchers update
them. Repacks show **Installed** and **Update** badges in the download list.

Games with an update are listed under **Updates** on the Downloads page.
**Ignore** hides that release for the game; a later one is offered again.
A notification is posted when a check finds new updates.

## Installing an update

**Update** opens the game's download dialog with the new release selected and
**Install over the current version** ticked. The checkbox appears for every
installed game, so any release can be installed in place, and can be
unticked to download the release next to the installed one instead.

The download and extraction run as usual. Then, instead of looking for an
executable:

1. Hydra finds the folder inside the download that matches the installed
   game: the one holding the game's executable at the same relative path,
   searching a few levels deep since releases often wrap the game in an extra
   folder. Failing that, the first folder whose top-level files mostly match
   the installed game's.
2. The game's saves are backed up with Ludusavi into the game's
   [backups](save-import.md#backups). Games Ludusavi does not know are updated
   without a backup; nothing below touches their saves anyway.
3. Every file of the update is moved into the installed folder, replacing the
   file at the same path. Files only the installed copy has stay: saves and
   configs kept in the game folder, mods, OptiScaler and its manifest.
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
