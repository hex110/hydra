# Game setup

Hydra prepares a game as soon as it becomes playable instead of waiting for
its first launch. Setup runs automatically when:

- a download finishes and Hydra finds the game's executable,
- you pick or change a game's executable in **Game options**,
- a library scan finds the game (see [Library scanning](library-scanning.md)).

Games are set up one at a time in the background. Setup never runs for games
installed by Steam or Epic, since those launchers own their files.

Settings live in **Settings → Compatibility → Game setup**.

## Steps

Setup runs these steps in order. One failing step is logged and the rest still
run.

| Order | Step                 | What it does                                                                                                                                                                                                                                     |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 100   | Wine prefix          | Linux, Windows executables only. Creates the game's prefix with `umu-run createprefix`, using the game's Proton version or the default one. Skipped if the prefix is already valid, or when **Create the game's Wine prefix right away** is off. |
| 200   | OnlineFix            | Linux, Windows executables only. Detects OnlineFix in the game folder and copies Steam's client files into the prefix. See [OnlineFix games](online-fix.md).                                                                                     |
| 300   | Save import          | Linux, Windows executables only. Looks for the game's saves and achievements on Windows installs and imports them or asks first. See [Save and achievement import](save-import.md).                                                              |
| 500   | OptiScaler           | See [OptiScaler](optiscaler.md).                                                                                                                                                                                                                 |
| 900   | Post-install command | Runs your command once per game. See below.                                                                                                                                                                                                      |

Prefix creation shares a lock with game launches, so launching a game while its
prefix is still being created waits for that instead of starting a second
`umu-run`.

## Preparing prefixes for existing games

**Prepare missing prefixes** queues setup for every library game that has a
Windows executable but no valid prefix. The count next to the button is
recalculated when the page opens and after the queue finishes.

A single game can be set up again from **Game options → Compatibility → Run
game setup**. This also re-runs the post-install command.

## Post-install command

A shell command (`/bin/sh -c` on Linux, `cmd.exe /c` on Windows) that runs once
per game after its prefix is ready. Its working directory is the folder of the
game's executable, and it receives:

| Variable                          | Value                                                                 |
| --------------------------------- | --------------------------------------------------------------------- |
| `HYDRA_GAME_TITLE`                | Game title                                                            |
| `HYDRA_GAME_SHOP`                 | `steam`, `custom`, …                                                  |
| `HYDRA_GAME_OBJECT_ID`            | Store ID (the Steam app ID for Steam games)                           |
| `HYDRA_GAME_DIR`                  | Folder containing the executable                                      |
| `HYDRA_GAME_EXECUTABLE`           | Full executable path                                                  |
| `HYDRA_SETUP_REASON`              | `download-complete`, `executable-changed`, `library-scan` or `manual` |
| `WINEPREFIX`, `HYDRA_WINE_PREFIX` | The game's Wine prefix (Wine games only)                              |
| `PROTONPATH`                      | The Proton version Hydra would launch with, if one is selected        |

The command is recorded as done for a game only when it exits with code 0, so a
failing command is retried the next time setup runs. Commands are stopped after
15 minutes. Output is appended to `post-install-<object id>.log` in Hydra's
logs folder.

Example: importing Windows save files into each new prefix.

```sh
~/.local/bin/import-saves --game "$HYDRA_GAME_TITLE" --prefix "$WINEPREFIX"
```
