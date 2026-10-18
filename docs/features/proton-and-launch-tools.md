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
