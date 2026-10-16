# Library folders and scanning

Hydra can scan folders where you keep installed games, add the games it finds
to your library and fill in executables for library games that have none.

Settings live in **Settings → Library folders**. The scan itself runs from the
scan button in the header, from **Scan now** on the settings page, or on
startup.

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
     (`Cyberpunk.2077.v2.3-FitGirl` → `Cyberpunk 2077`).
   - If exactly one catalogue game has the same title (ignoring punctuation,
     roman numerals and edition suffixes such as "Deluxe Edition"), the game is
     added.
   - Otherwise, close matches are listed in the scan dialog for you to pick
     from. A sequel never counts as the same title (`Hades` ≠ `Hades II`).
   - The executable is the catalogue's known one if present; otherwise Hydra
     picks one, skipping installers, redistributables, crash reporters and
     tools, and preferring executables named after the game, near the top of
     the folder and large in size.

Folders without any `.exe` (archives, unfinished downloads, native Linux games)
are skipped, as are folders that already hold a library game.

## After a game is added

Every game the scan adds or links runs [game setup](game-setup.md), which
creates its Wine prefix on Linux.
