# Library folders and scanning

Hydra can scan folders where you keep installed games, add the games it finds
to your library and fill in executables for library games that have none.

Settings live in **Settings → Library folders**. The scan itself runs from the
scan button in the header, from **Scan now** on the settings page, on
startup, or by itself when a library folder changes.

## Rescan automatically

With **Rescan automatically** on, Hydra watches the top level of each folder
in **Library folders** (not Steam's libraries or the downloads folder, which
are covered elsewhere). When a folder appears or disappears there, it waits
15 seconds for things to settle, then until the new folder has stopped
growing (its file count and size are unchanged for 20 seconds, which covers
copies and extractions that take a while), and runs the same background scan
as **Scan these folders when Hydra starts**. It then checks every game's
executable again, so a game whose folder was removed is marked
[missing](game-page.md#missing-files). Changes that arrive during a scan get
another scan afterwards.

The scan only posts a notification when it found something. The setting is
off by default; a folder that can't be watched (an unmounted drive) is
skipped until the setting or the folder list changes.

## Scan modes

| Mode      | Scans                                                                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Automatic | Your Steam libraries, Hydra's downloads folder and every folder in **Settings → Library folders**. On Windows, also `C:\Games` and `D:\Games`. |
| Manual    | Only the folders you pick in the scan dialog.                                                                                                  |

Automatic is the default on Windows, and on other platforms once at least one
library folder is configured.

**Scan these folders when Hydra starts** runs an automatic scan in the
background on each start. It only posts a notification when it found
something.

## How games are identified

1. **By executable.** Hydra keeps a catalogue of the executable names of Steam
   games. Any file in a scanned folder whose name is in the catalogue is
   matched to its game. This is the same matching Hydra has always used.
2. **By folder name.** With **Identify games by their folder name** on (the
   default), every subfolder directly inside a library folder or the downloads
   folder that step 1 did not claim is looked up by name:
   - The name is cleaned first: separators become spaces, and bracketed tags,
     versions, build numbers and release group names are removed
     (`Cyberpunk.2077.v2.3-FitGirl` → `Cyberpunk 2077`, `DMD.CH4-1.01-pc` →
     `DMD CH4`). In names without spaces, a dot between digits belongs to a
     version, and a hyphen before a version or a platform tag (`-pc`,
     `-win64`) separates it. Names without spaces
     are split at capitals and numbers (`AceCombat8` → `Ace Combat 8`), but
     uppercase runs and lowercase names stay whole (`CH4`, `r2modman`).
   - If exactly one catalogue game has the same title (ignoring punctuation,
     roman numerals and edition suffixes such as "Deluxe Edition"), the game is
     added.
   - Otherwise, close matches are listed in the scan dialog for you to pick
     from. A sequel never counts as the same title (`Hades` ≠ `Hades II`).
   - If nothing in the catalogue resembles the name, the folder is listed
     under **N folders weren't recognised**, with a search box filled in with
     the cleaned name. A folder named after a game that is already in your
     library is left out.
   - The executable is the catalogue's known one if present; otherwise Hydra
     picks one, skipping installers, redistributables, crash reporters and
     tools, and preferring executables named after the game, near the top of
     the folder and large in size. Easy Anti-Cheat's `start_protected_game.exe`
     counts as a launcher, so the game binary wins over it. When you pick the
     game yourself, Hydra looks for the catalogue's known executable again
     before keeping its guess.

## Choosing the game yourself

Every executable or folder in the scan dialog that needs a choice has a
**Not listed? Search** button. It opens a catalogue search, so you can pick a
game the suggestions missed. Unrecognised folders open with the search already
showing. Anything you leave unpicked is not added.

When a scan has no other questions, unrecognised folders appear as a line
under the results with an **Identify them** button. They are not counted in
the scan notification, so the startup scan stays quiet about launcher and
mod-manager folders.

Folders without any `.exe` (archives, unfinished downloads, empty folder
skeletons, native Linux games) are skipped, as are folders that already hold a
library game. The scan results list the skipped folders under **N folders were
skipped**, so a game that seems missed can be told apart from an empty folder.

## Ignoring folders

Launchers and mod managers (`Prism Launcher`, `r2modman`, `Vortex Mods`)
contain executables but are not games. **Not a game** next to a folder in the
scan dialog ignores it for good: later scans skip the folder and everything
inside it, including executable-name matches. Ignored folders are listed in
**Settings → Library folders → Ignored folders**, where they can be scanned
again. The list is stored as `libraryScanIgnoredFolders`.

## After a game is added

Every game the scan adds or links runs [game setup](game-setup.md), which
creates its Wine prefix on Linux.
