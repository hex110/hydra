# Achievements

## Emulator achievement files at launch

Games cracked with a Steam emulator keep their own achievement files, and some
of them cannot work until those files exist. Hydra prepares them when a game
starts, before the game process is launched, so the player does not have to.
Both steps only apply to Steam games, and both read the achievement list from
the Hydra catalogue.

### Goldberg metadata and icons

For a game with a Goldberg `steam_settings` folder, Hydra writes
`steam_settings/achievements.json` and downloads the achievement icons next to
it, unless they are already there. It runs in the background, shows its
progress in the launcher status and stops when the game closes. The code is in
`src/main/services/achievements/metadata-export/`.

### RUNE and CODEX achievement lists

RUNE and CODEX ship as `steam_api64.dll` and `steam_emu.ini` (plus a `.rne` or
`.cdx` file). The emulator only knows the achievements already listed in its
`achievements.ini`. With a fresh, empty file it reports zero achievements and
fails every lookup. Unreal Engine games read the whole list first and skip the
ones they cannot read, so in those games nothing ever unlocks.

Before launch, Hydra finds the game's `steam_emu.ini`, works out whether it is
RUNE or CODEX and which app id it uses, and lists every achievement of the game
as locked in:

```
<prefix>/drive_c/users/Public/Documents/Steam/<RUNE|CODEX>/<AppId>/achievements.ini
```

On Windows the same path is under `C:\Users\Public\Documents`. The code is in
`seed-emulator-achievement-lists.ts`, with the file format in
`emulator-achievement-list.ts`.

- It only adds achievements the file is missing, as locked. Sections that
  already exist, unlocked ones included, are left exactly as they are.
- If the file already lists everything, it is not written at all.
- It never creates a Wine prefix. If the prefix is not set up yet (a first
  launch before game setup), it logs that and does nothing; the next launch
  seeds the file.
- It runs during the launch delay. If it is still busy after 4 seconds (the
  catalogue does not answer, or a slow disk), the game starts anyway.
- Achievements the player earned before the file was seeded are not recovered:
  the emulator never recorded them.
