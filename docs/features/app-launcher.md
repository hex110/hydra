# Games in the app launcher (Linux)

Hydra Plus adds a desktop entry for every installed game, so app launchers
(rofi, fuzzel, the dms/noctalia launcher, GNOME and KDE search) can find the
game by name and start it without opening Hydra Plus first.

Turn it off in **Settings → Downloads → Show installed games in the app
launcher**. Turning it off removes the entries.

## What is written

- One file per game: `$XDG_DATA_HOME/applications/hydraplus-game-<shop>-<objectId>.desktop`
  (`~/.local/share/applications/` by default).
- `Exec` runs Hydra Plus with a `hydraplus://run?shop=…&objectId=…` link, so the
  game starts with its usual launch options, launch rules and Proton setup.
  For an AppImage, the entry points at the AppImage file, not its temporary
  mount.
- `Icon` is a 256×256 PNG made from the game's icon (custom icon first, then
  the store icon, then a custom cover) and kept in
  `~/.config/hydra-plus/Assets/<shop>-<objectId>/launcher-icon-<hash>.png`.
  Steam's `.ico` icons are decoded directly; icons that are only 4- or 8-bit
  bitmaps get no icon and the launcher shows its default.

A game counts as installed when it has an executable and is still in the
library. Entries are synced on start and a couple of seconds after any library
change (new executable, removed game, setting toggled). Files with the
`hydraplus-game-` prefix that no longer match an installed game are deleted;
nothing else in the folder is touched.

## Development

A dev build (`electron-vite dev`) writes no entries unless
`HYDRA_PLUS_APPLICATIONS_DIR` names a folder, so it never replaces the
installed app's entries with ones that start a dev instance.

Code: `src/main/services/app-launcher-entries.ts`,
`src/main/helpers/desktop-entry.ts`, `src/main/helpers/decode-ico.ts`.
