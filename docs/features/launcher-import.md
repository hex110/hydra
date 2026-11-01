# Games from Heroic and Lutris

**Settings → Library folders → Import from Heroic and Lutris** adds games
another Linux launcher installed, the way Playnite's library importers do.
Nothing is copied or moved and Heroic and Lutris keep working: each game runs
from its current folder, in the Wine prefix that launcher made (so its saves
come along), and starts with the playtime and last played date that launcher
recorded.

## What is read

| Launcher | Files                                                                                                       | Gives                                    |
| -------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Heroic   | `legendaryConfig/legendary/installed.json`                                                                  | Epic games: title, folder, executable    |
| Heroic   | `gog_store/installed.json`, titles from `store_cache/gog_library.json`, executable from `goggame-<id>.info` | GOG games                                |
| Heroic   | `sideload_apps/library.json`                                                                                | Games added to Heroic by hand            |
| Heroic   | `GamesConfig/<app>.json` (`winePrefix`), `store/timestamp.json`                                             | Prefix, playtime (minutes), last played  |
| Lutris   | `pga.db` (`games` table), `games/<configpath>.yml` (`game.exe`, `game.prefix`)                              | Installed Wine and Linux games, playtime |

Heroic is looked for in `~/.config/heroic` and its Flatpak folder, Lutris in
`~/.local/share/lutris` (its YAML also in `~/.config/lutris/games`) and its
Flatpak folder. Lutris's library is SQLite; Hydra reads it read-only through
`python3`'s `sqlite3` module, which every Lutris install has, rather than
bundling SQLite. Lutris games on other runners (Steam, emulators) are left
out: the library scan adds Steam games, and Classics handles emulators.
Amazon games in Heroic are not read yet.

## Matching

Each title is looked up in the catalogue the way the library scan names
folders: one exact match is picked and ticked; otherwise the closest titles are
offered in a **Which game is this?** list, unticked. A game is not offered when
a library game already runs from its folder, when the launcher names no
executable, or when the catalogue doesn't know the title (add it as a custom
game). The import adds games through the library scan's
`addGameOutsideLibrary`, so they get the same setup, artwork and achievements.
Game setup then runs as for any added game, in the launcher's prefix: umu
updates that prefix to the Proton build Hydra Plus uses, as switching Wine
versions in Heroic or Lutris would.

`launcher-import-core.ts` reads the files (tested against fixtures),
`services/launcher-import/index.ts` matches and imports.
