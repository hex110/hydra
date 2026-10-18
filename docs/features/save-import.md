# Save and achievement import

When a Windows game is added on Linux, Hydra can bring over its saves and the
achievements its crack recorded from upstream Hydra Launcher on the same
computer, or from a Windows install on another drive or partition, such as a
dual-boot Windows. Settings live in
**Settings → Saves & achievements**; each game has a **Saves & achievements**
section in its options.

## Sources

### Upstream Hydra Launcher

Hydra Plus keeps its data apart from upstream Hydra, Wine prefixes included,
so a game you played in upstream Hydra starts with an empty prefix here. When
upstream's data folder (`~/.config/hydralauncher`) exists, it is a source,
shown as `Hydra Launcher (<folder>)`.

Each game is matched by store and id, and its saves are read from the prefix
upstream runs it in: the game's own prefix if one was set, otherwise
`<id>` under upstream's default prefix folder (`wine-prefixes` in its data
folder unless changed in its settings). Hydra reads these settings from a
copy of upstream's database, so upstream can stay open; nothing in upstream's
folder is changed. A game whose prefix in Hydra Plus is the same folder is
skipped. Custom games have their own id in each app and are not matched.

### Windows installs

Hydra looks for Windows installs in the folders mounted under `/mnt`, `/media`
and `/run/media/<user>`. A folder counts as a Windows drive when it has a
`Users` folder with at least one profile that has `AppData`. Each profile is a
separate source, shown as e.g. `Windows on /mnt/Windows (moonlight)`.

- Untick a source, upstream Hydra included, to stop importing from it.
- **Add Windows drive** adds a drive Hydra did not find; pick the folder that
  contains `Users`. Each of its profiles is added.

The drive can be mounted read-only; imports only read from it.

## What is imported

**Saves** are found with the same save database
([Ludusavi's manifest](https://github.com/mtkennerly/ludusavi-manifest)) and
path mapping Hydra Cloud uses. That covers saves in the profile
(`AppData`, `Documents`, `Saved Games`, …), in `ProgramData` and in `Public`.
Paths are mapped into the game's Wine prefix (`drive_c/users/steamuser/…`).
From upstream Hydra, that is the same place in the other prefix.
Saves Steam keeps in its own `userdata` folder are left out: Steam Cloud
syncs those, and a game run from a Wine prefix does not read them.

**Achievements** are read from the files crack emulators write (Goldberg/GSE,
CODEX, RUNE, OnlineFix, …), found the same way Hydra finds them in a prefix.
The files are copied into the prefix, at the same place, and the unlocked
achievements are merged into the game's achievements. Merging needs a Hydra
account, since that is where the achievement list comes from; signed out, the
files are still copied and Hydra merges them after you sign in.

## When it runs

**When a game is added** decides what happens after a Windows game is set up
(see [Game setup](game-setup.md); this is step 300, once the prefix exists):

| Option               | Behaviour                                                                  |
| -------------------- | -------------------------------------------------------------------------- |
| Ask before importing | Default. Shows a notification and offers the import in the game's options. |
| Import automatically | Imports right away.                                                        |
| Don't look for saves | Nothing happens on its own; imports are started by hand.                   |

A game is only checked on its own until its saves have been imported or the
offer was turned down with **Don't import**.

When several sources have saves for a game, Hydra picks the one whose newest
save file was written last. The game's options can pick another.

**Import for all games** in the settings imports into every Windows game
already in the library, from each game's best source. Games without a prefix
yet are skipped.

## Safety

- A file is only replaced when the source's copy is newer. Files that are
  newer in the game are kept, unless **Also replace files that are newer in
  the game** is ticked for that import.
- Identical files are skipped, so running an import twice changes nothing.
- Every file an import replaces is copied first to
  `<Hydra data>/save-import/backups/<shop>-<id>/<time>/`, laid out like the
  prefix. The game's options link to the backup after an import.

## Backups

Backups of a game live in `<Hydra data>/save-import/backups/<shop>-<id>/`, one
timestamped folder each:

- `<time>/`: the files a save import replaced, laid out like the prefix;
- `<time>-update/`: a Ludusavi backup of the game's saves, made before an
  [update](updates.md) is installed.

**Settings → Saves & achievements → Backups** lists every game with backups,
how many and their size on disk, with buttons to open or delete them.
**Backups to keep per game** deletes the oldest backups beyond that number
whenever a new one is made; **Delete older backups now** applies it to every
game at once. Empty keeps every backup. The game's **Saves & achievements**
section shows the same for one game.

## Per game

The game's **Saves & achievements** section shows what a source has: how many
files are new, replace older ones, are identical or are newer in the game,
how many achievements are unlocked, and the list of files with where each one
goes. From there you can pick the source, choose whether to import
achievements and newer files, import, or turn the offer down.

## Later sources

Sources share one interface: list a game's saves in Hydra Cloud's snapshot
format, find achievement files, and provide a file's contents. Import,
path mapping and backups do not depend on where files come from, so Steam
Cloud and a cloud account can be added as sources without changing them.
