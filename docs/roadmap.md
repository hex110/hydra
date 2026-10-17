# Hydra Plus roadmap

What we plan to add or fix, in order. Shipped features are documented in
`docs/features/`; move an item there (and out of this file) when it ships.

## Next, in order

1. [ ] **Update detection.** Notice when an installed game has a newer
       download in your sources.
2. [ ] **Per-game OnlineFix switch.** Turn the automatic OnlineFix
       preparation off for a single game.
3. [ ] **Setup log per game.** Show what each setup step did, or why it was
       skipped.
4. [ ] **Proton version in launch rules.** Let a rule pick GE-Proton or
       Proton-CachyOS.

## Library scanning

- [ ] **Ignore a folder.** Unrecognised folders such as launchers and mod
      managers (`Prism Launcher`, `r2modman`, `Vortex Mods`) show up after
      every scan. Add "this is not a game" to hide them for good.
- [ ] **Explain skipped folders.** A folder without any `.exe` is skipped
      silently. `~/Downloads/Cult of the lamb` looked like a missed game but
      was an empty folder skeleton; the game itself lives in
      `/mnt/Multimedia/home-offload/Downloads/`. A "skipped: no executable"
      list would have made that obvious.
- [ ] **Better version stripping.** `DMD.CH4-1.01-pc` cleans to
      `DMD CH4-1 01-pc`.

## Linux gaming

- [ ] **GameMode and MangoHud settings.** Toggles and a MangoHud config editor
      (position, metrics, FPS limit), per game and as defaults. Probably as
      launch-rule actions.
- [ ] **GOverlay vs a built-in MangoHud editor.** Decide whether to launch
      GOverlay or build our own editor before starting the item above.

## Downloads

- [ ] **Paste a Steam link.** Paste a store URL in Hydra to open the game and
      start the download choice. The browser add-on already covers this from
      the Steam store page.

## Save import, later sources

All of these plug into the `SaveImportSource` interface.

- [ ] **Steam Cloud.** Download cloud saves for every owned game, installed or
      not. Needs a Steam login inside Hydra.
- [ ] **Hydra cloud account.** Import from it once it exists.
- [ ] **Steam's own prefixes.** Write imports into Steam's per-game prefixes
      for games played through Steam.

## Distribution and upkeep

- [ ] **pacman updates.** The in-app updater only updates the AppImage. Add a
      `hydra-plus-bin` AUR package or a small pacman repo.
- [ ] **Backup cleanup.** A setting to keep only the last N backups per game.
- [ ] **Translations.** The Hydra Plus settings are English-only; other
      languages fall back to English.
- [ ] **Sign the browser add-on** for Firefox Add-ons, and the Chrome Web
      Store if wanted.

## Postponed

- Built-in download sources, and why the laptop gets different server source
  ids for the same URL.
- Self-hosted cloud saves on Cloudflare.
- Installing on the laptop (offline in Tailscale). Leave the HDR rule off
  there.

## Known problems

- Broken sources: the Rutracker source URL returns 404; onlinefix sits behind
  a Cloudflare challenge.
- `tsc` reports TS7056 on `src/locales/index.ts` (the inferred translation
  type is too large). It predates the fork's changes.

## Declined

- Built-in LinUwUx/Denuvo detection. A launch rule can do it.
- LuaTools, SteamTools, SteaMidra or ACCELA as a download source.
