# RenoDX

[RenoDX](https://github.com/clshortfuse/renodx) is a set of
[ReShade](https://reshade.me) add-ons that replace a game's tone mapping so it
outputs real HDR. Many games have a mod of their own. Hydra downloads ReShade
and the game's mod, installs both into the game's folder, keeps track of what it
wrote and removes it cleanly. It does the job the Windows tool
[RHI](https://github.com/RankFTW/RHI) does, for the part that works under
Proton too.

Settings live in **Settings → RenoDX**. Each Windows game has a **RenoDX**
page in its options. The [HDR and RenoDX plan](../renodx-hdr-plan.md) has the
background, the test results and what is still to come.

## HDR needs more than the mod

RenoDX asks Windows (here, Wine) for an HDR swapchain. Under Proton that only
works when the monitor is already in HDR when the game starts, which the HDR
[launch rules](launch-rules.md#hdr) do: the built-in **HDR** rule, and on
Hyprland **HDR: switch the monitor** with `hypr-hdr`, which ships with Hydra
Plus. Only Hyprland is supported for the monitor switch. With **Turn on the HDR
launch rules for games that get RenoDX** (on by default) installing RenoDX
turns on the HDR rule for that game, and the monitor switch too when the game is
on Hyprland and `hypr-hdr` is on `PATH`. The rules' state is shown in the game's
**General** options, not repeated on the RenoDX page, and removing RenoDX
leaves them as they are.

Inside the game, turn HDR on in its own settings. The mod follows that toggle.

The Proton build matters. Wine's Wayland HDR support is what the HDR rule turns
on, and not every build has a working one: GE-Proton 11 gives RenoDX an HDR10
swapchain, while UMU-Proton 10, umu's default when nothing is chosen, does not
(RenoDX logs that it could not set the colour space). Pick a Proton build for
the game or as the default in **Settings → Compatibility** if the mod shows no
HDR.

## Which mod

Hydra reads RenoDX's own list of games and mods
(`games-index.json`, downloaded daily from the `snapshot` release and kept
for offline use). A Steam game matches by its app id; any other game matches by
title or alias. If the file is in a format Hydra does not know, nothing is
installed.

- Only game-specific mods are offered. The generic Unreal Engine and Unity
  add-ons are not.
- Stable mods and mods the list does not rate are offered. Beta and
  experimental ones are only offered with **Include beta and experimental
  mods**.
- A game with a plain mod and a variant (for example an "Alternate" one) gets
  the plain mod.
- The add-on is the 64-bit or 32-bit file to match the game's executable,
  which Hydra reads from the executable itself.

## Where it is installed

Next to the game's executable, or, for Unreal Engine games started from a
bootstrap executable, next to the `-Shipping` one, the same folder OptiScaler
uses. Hydra writes:

| File                                     | What                                                                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `dxgi.dll`, `d3d9.dll` or `opengl32.dll` | ReShade, named for the game's graphics API: `dxgi.dll` for Direct3D 10 to 12, `d3d9.dll` for Direct3D 9, `opengl32.dll` for OpenGL. |
| `renodx-<mod>.addon64`/`32`              | The mod. ReShade finds add-ons in the game folder by itself.                                                                        |
| `ReShade.ini`                            | Seeded with the tutorial skipped and the settings below.                                                                            |
| `.hydra-renodx.json`                     | The manifest: every file written, every directory created, every game file moved aside.                                             |
| `.hydra-renodx-backup/`                  | Game files ReShade replaced, restored on removal.                                                                                   |

The API comes from the executable's import tables (and, for Unity,
`UnityPlayer.dll`); a game that names no graphics library there is read for the
library names instead. A game that only uses Vulkan is not supported: ReShade
needs a layer there, which is not tried under Wine yet.

Hydra never replaces a file it did not write without backing it up, and
refuses when a tool it recognises owns the name:

- **OptiScaler** holds `dxgi.dll`: ReShade is installed as `ReShade64.dll`
  (`ReShade32.dll`) beside it and `LoadReshade=true` is set in `OptiScaler.ini`,
  which is how OptiScaler is meant to load ReShade. Reinstalling OptiScaler
  keeps that setting. Tested with Sekiro: OptiScaler loads ReShade and the mod
  gets HDR10.
- **DXVK, Special K, ENB** or an unknown DLL holds the name: nothing is
  installed and the game's page names the file. A ReShade that Hydra did not
  install is treated the same way; remove it to let Hydra manage ReShade.
- OptiScaler installed after RenoDX picks another proxy name, since the name
  ReShade has is taken (Sekiro got `winmm.dll`). Both load, and the mod gets
  HDR10 in that order too.

An existing `ReShade.ini` is the game's own: Hydra changes it in place (see
below) and leaves it when RenoDX is removed. A `ReShade.ini` Hydra created is
removed with the rest.

## ReShade settings

**ReShade settings** is an INI fragment, like OptiScaler's overrides, applied to
the `ReShade.ini` of every game RenoDX is installed in and, by the
[game setup](game-setup.md) step, to the `ReShade.ini` any game already has. The
default is:

```ini
[INPUT]
KeyOverlay=121,0,0,0
```

which opens the overlay with **F10** instead of ReShade's `Home`, since many
keyboards have no `Home` key. The value is `virtual key, ctrl, shift, alt`. An
empty field applies nothing. A key changed in the overlay is replaced the next
time the settings are applied.

## Automatic installation

Off by default. With **Install RenoDX in games that have a mod** on, the
**RenoDX** [game setup](game-setup.md) step runs for each newly set up game,
before OptiScaler. A game is skipped when:

- it has no mod, or only a beta one while beta mods are off, or none for its
  architecture;
- it only uses Vulkan;
- it ships an anti-cheat (Easy Anti-Cheat, BattlEye, Vanguard, FACEIT,
  GameGuard, EA Javelin), found by name at the top of the game folder or one
  level down. A game's page still lets you install by hand, with a warning;
- OptiScaler's compatibility list marks the game as not working with injected
  DLLs;
- ReShade, a RenoDX add-on or another tool's DLL is already in its folder;
- it is opted out, with **Never install RenoDX automatically in this game** or
  by removing RenoDX from it;
- another launcher owns its files (Steam installs, Epic imports).

You can install into any Windows game that has a mod from its options, also
when automatic installation is off. **Install in all games that have a mod** on
the settings page runs the same checks over the library and ignores the
automatic installation toggle but not opt-outs.

## Versions and updates

ReShade's add-on build comes from reshade.me (the newest stable one, checked at
most every six hours) and the mods from RenoDX's `snapshot` release, which is
rebuilt often. A mod's version is its build date. A game's page says when
ReShade or its mod has a newer build; **Update** installs both again, and
**Update the installed games** does that for the library. The two newest builds
of each are kept in `<userData>/reshade` and `<userData>/renodx`, so an older
one is still on disk; **Clear downloads** deletes them without touching games.

## Linux

Under Proton the proxy DLL must be loaded from the game folder, not Wine's
builtin. Hydra adds `WINEDLLOVERRIDES=<dll>=n,b` to the launch of a game with
RenoDX, merged with the game's own, like OptiScaler's. Hydra leaves
`d3dcompiler_47` alone: asking for a native copy of it stops games from
starting in a prefix that has none.

## Risks

ReShade and add-ons can trip anti-cheat, which is why automatic installs skip
games that ship one. Do not install them in online games with anti-cheat. Mods are rebuilt nightly and can break after a game update;
**Remove** undoes everything.
