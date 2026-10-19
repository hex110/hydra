# Proton builds and launch tools

Linux only. Settings live in **Settings → Compatibility**; per-game options in
the game's **Compatibility** options; rule actions in **Settings → Launch
rules**.

## Proton builds

**Proton builds** downloads [GE-Proton](https://github.com/GloriousEggroll/proton-ge-custom)
and [Proton-CachyOS](https://github.com/CachyOS/proton-cachyos) releases into
`~/.local/share/Steam/compatibilitytools.d`. Builds there appear in every
Proton picker: the default in settings, each game's own, launch rules, and
Steam itself.

- Each flavor lists its recent releases (checked on GitHub at most every six
  hours, or with **Check for releases**). Pick one and **Install**; the
  newest is preselected.
- The archive is checked against the release's `.sha512sum` before it is
  extracted.
- Proton-CachyOS has a build for x86-64-v3 CPUs (AVX2); Hydra installs it when
  the CPU supports it, otherwise the generic one.
- Builds Hydra installed are listed with **Remove**. Removing one that games
  or the default use asks first; those games fall back to the default.
  Builds installed some other way are never removed.
- **Install new … releases when Hydra starts** keeps a flavor current: on each
  start Hydra installs a newer release if there is one. If the default Proton
  was an older build of that flavor, the default moves to the new build.
  Games that picked a specific build keep it, and older builds are not
  removed.

Hydra records what it installed in `<Hydra data>/proton-manager.json`.

## Launch rule actions

Besides launch options, a [launch rule](launch-rules.md) can, under **Proton,
MangoHud, GameMode and gamescope**:

| Action            | Effect                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Proton build      | A specific build, or the newest installed GE-Proton or Proton-CachyOS. Used for launches and for creating the prefix.                           |
| Run with MangoHud | Turns MangoHud on for the games the rule applies to.                                                                                            |
| Run with GameMode | Turns GameMode on for those games.                                                                                                              |
| Run in gamescope  | Wraps the game in `gamescope`: output size, the size the game renders at (upscaled to the output), FPS limit, fullscreen, HDR, extra arguments. |

The Proton build a game launches with is, in order: the build picked in the
game's options, the last applied rule that picks one, the default from
settings, and otherwise umu-run's own default. The
[launch command preview](launch-rules.md#launch-command-preview) shows which
one won and why.

Gamescope is added as a wrapper (`gamescope -W 3440 -H 1440 -r 120 -f
--hdr-enabled -- %command%`) after the rule's own launch options, so it
combines with everything else like any other wrapper.

Left empty, the output size and FPS limit come from the display Hydra's
window is on (nested gamescope otherwise opens at 1280×720 and 60 Hz). The
refresh rate comes from Electron, or `hyprctl monitors` / `xrandr` where
Electron reports 0 Hz, as it does on Hyprland. Inside a gamescope session
(SteamOS gaming mode) the action is skipped, as that session already runs
gamescope.

## MangoHud layouts

MangoHud can be turned on globally, per game, or by a rule. What it shows
comes from a layout:

- **Settings → Compatibility → MangoHud layout** sets a layout for every game:
  position, which items to show (FPS, frame time graph, GPU and CPU load and
  temperature, VRAM, RAM, resolution, graphics API, Wine version, present
  mode, gamescope FSR and HDR), an FPS limit, a horizontal bar, and extra
  MangoHud options. Without it, MangoHud reads its own config file as before.
- A game's **MangoHud layout** can follow that, or use its own.

At launch Hydra writes the layout to `<Hydra data>/mangohud/<shop>-<id>.conf`
and points `MANGOHUD_CONFIGFILE` at it. Launch options that set
`MANGOHUD_CONFIGFILE` themselves win.

### Why a built-in editor rather than GOverlay

GOverlay edits MangoHud's global config file (or per-executable files), so it
cannot give two Proton games different layouts without renaming tricks, and it
is a separate app that may not be installed. A layout written per launch works
per game, follows rules and defaults, and needs nothing else installed.
GOverlay keeps working for the global file when a game uses MangoHud's own
config.

### Upscaler and frame generation line

**Show the upscaler and frame generation** adds a line such as
`Upscaler FSR 4 · FG XeFG`. What it can show was the open question:

- MangoHud itself only knows gamescope's FSR (`fsr`) and HDR (`hdr`); both are
  layout items.
- A game's built-in DLSS, FSR or XeSS, and its own frame generation, are
  invisible from outside the game.
- [OptiScaler](optiscaler.md) logs what it does: the upscaler it creates
  (`init successful for fsr31`), whether it loaded FSR 4 for RDNA 4, and its
  frame generation setting and failures (`FrameGen.Enabled`,
  `FrameGen.FGOutput`, `Can't init FG Feature`).

So the line is shown for games with OptiScaler installed by Hydra: MangoHud
runs a small script (`<Hydra data>/mangohud/optiscaler-status.sh`) through
`exec=` that reads the last lines of `OptiScaler.log` in the game folder. It
reads `native` before OptiScaler has created an upscaler, `FG off`,
`FG failed` or `FG <output>` for frame generation, and
`OptiScaler log missing` when OptiScaler is not logging to a file
(`LogToFile` in `OptiScaler.ini`).

## Prefix tools

A Windows game's **Wine prefix** options show the prefix's size on disk and
folder, next to upstream's Winetricks and Proton-switch reset:

- **winecfg** opens Wine's configuration for the prefix, through umu-run with
  the game's Proton build.
- **Reset prefix** deletes the prefix and creates it again (game setup's Wine
  prefix and OnlineFix steps). Saves stored in the prefix are deleted with it.
  Hydra refuses when the game is running, or when the folder does not look
  like a prefix (no `drive_c` or `pfx`).

## Launcher redirects

Some games start a publisher launcher first, such as Cyberpunk's
`REDprelauncher.exe` or Baldur's Gate 3's Larian launcher. Under Proton these
are often slow or broken, and wrappers, MangoHud and OptiScaler end up on the
launcher instead of the game. When a game's executable is a known launcher and
the game it starts is in the folder, Hydra runs the game directly:

| Launcher                      | Game                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `REDprelauncher.exe`          | `bin/x64/Cyberpunk2077.exe`, or Witcher 3's `bin/x64_dx12/witcher3.exe` / `bin/x64/witcher3.exe` |
| `Launcher/LariLauncher.exe`   | `bin/bg3_dx11.exe`                                                                               |
| `Launcher.exe`                | `Retail/HITMAN3.exe`                                                                             |
| `Launcher/sop_launcher.exe`   | `SYNCED.exe`                                                                                     |
| `launcher/Launcher.exe`       | `binaries/Darktide.exe`, `binaries_dx12/vermintide2_dx12.exe`                                    |
| `FactoryGameSteam.exe`        | `Engine/Binaries/Win64/FactoryGameSteam-Win64-Shipping.exe`                                      |
| `boot/ffxivboot.exe`          | `game/ffxiv_dx11.exe`                                                                            |
| `Launcher/FuncomLauncher.exe` | `DuneSandbox/Binaries/Win64/DuneSandbox-Win64-Shipping.exe`                                      |

Paths are relative to the folder the launcher path starts in, and names match
regardless of case. The list comes from GOverlay's `bgmod` (MIT); its 2K
launcher entry is left out because it has no fixed game executable.

- The game's executable setting keeps the launcher; only what runs changes.
  The game's **Executable** options say so and have **Start through the
  launcher** for games that need it; the launch preview shows the redirect.
- Playtime tracking looks for the game as well as the launcher, OptiScaler
  installs next to the game, and Steam shortcuts point at the game.

## Steam shortcuts

**Add to Steam** on Linux makes a shortcut that runs the game with Steam's
Proton, in Hydra's prefix, with the launch options Hydra would use:

- The prefix goes in as `STEAM_COMPAT_DATA_PATH`. Steam's Proton runs the
  prefix in that folder's `pfx` subfolder, and Hydra prefixes have a `pfx`
  link back to themselves (Hydra adds it if it's missing), so Hydra and Steam
  share one prefix and its saves. Upstream instead pointed the game at a new,
  empty `compatdata` prefix.
- Hydra's DLL overrides (OptiScaler, OnlineFix), launch rules, default and
  per-game launch options, MangoHud and GameMode are written into the
  shortcut's launch options, quoted for the shell Steam runs them in. They are
  a snapshot: remove and add the shortcut again after changing them.
- Steam picks the Proton build, not Hydra. The success message names the
  build Hydra uses for the game; choose it under the shortcut's
  **Properties → Compatibility**, since a different version upgrades or
  downgrades the shared prefix.
- Hydra's launch-time steps (OptiScaler file check, cloud saves, playtime)
  don't run when Steam starts the game.
