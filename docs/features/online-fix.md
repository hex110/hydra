# OnlineFix games

Games with [OnlineFix](https://online-fix.me) need two things under Wine that
a fresh prefix does not have:

1. **Their proxy DLL loaded from the game folder.** OnlineFix hooks the game
   through a DLL such as `winmm.dll` or `version.dll` placed next to it, but
   Wine prefers its own builtin copy of those DLLs.
2. **Steam's client files in the prefix.** OnlineFix loads the original
   `steamclient64.dll` from `C:\Program Files (x86)\Steam`; without it the
   game fails with error 126.

With **Prepare OnlineFix games** on (the default, in **Settings →
Compatibility**), Hydra handles both on Linux.

## What Hydra does

- [Game setup](game-setup.md) looks for `OnlineFix.ini` or `OnlineFix64.dll`
  in the game folder and records which of these proxy DLLs sit beside it:
  `winmm`, `version`, `winhttp`, `wininet`, `dinput8`, `dsound`,
  `xinput1_3`, `xinput1_4`, `xinput9_1_0`. `dxgi` and `d3d*` are left to
  Proton's DXVK and VKD3D.
- Once the prefix exists, it copies `steamclient64.dll`, `steamclient.dll`,
  `GameOverlayRenderer64.dll`, `tier0_s64.dll` and `vstdlib_s64.dll` into
  `drive_c/Program Files (x86)/Steam`. Each file comes from the first place
  that has it:
  1. a Linux Steam install (`~/.local/share/Steam`, `~/.steam/steam`, the
     Flatpak);
  2. a Windows Steam install on a mounted drive (`/mnt/*`, `/media/*`,
     `/run/media/$USER/*`), the only place `tier0_s64.dll` and
     `vstdlib_s64.dll` exist;
  3. another Wine prefix of Hydra Plus or upstream Hydra that already has it.

  Files already in the prefix are kept. Missing files are listed in the log.

- At launch, the proxy DLLs are added to `WINEDLLOVERRIDES` as `native,builtin`,
  merged with any overrides in the game's launch options.

Games set up before this existed are checked the first time they are
launched. The game's **Compatibility** options show when OnlineFix was
detected, and **Prepare OnlineFix for this game** turns both parts off for that
game only: setup skips it and the DLL overrides are not added at launch. The
setting is stored per game (`onlineFixDisabled`).

This replaces the standalone `hydra-prep` script, which edited the prefix's
`user.reg` instead and had to wait for Proton to create it.

## Steam emulators and Proton's Steam bridge

Many cracks bring their own Steam: a `steamclient64.dll` and a loader DLL
(RUNE's `winmm.dll`, for example) that answer the game's Steam calls. Proton
has a bridge, `lsteamclient`, that forwards Steam calls to a running Linux
Steam. When a game loads a `steamclient64.dll`, Proton swaps the bridge in
and patches the DLL's exports to point at it. With no Steam running the game
then stops at `Failed to initialize Steamworks system`, whatever the crack
does, with errors such as `Cannot create IPC pipe to Steam client process`.

Hydra launches games through umu, without Steam, so on Linux it adds
`lsteamclient=d` to `WINEDLLOVERRIDES` for every Windows game. GE-Proton does
the same for umu launches; Proton-CachyOS 11 (`proton-cachyos-slr`) only does
it on the Steam branch of its launch script, which a Hydra launch never takes.
The override is visible in the [launch command
preview](launch-rules.md#launch-command-preview), and a game's own or the
default launch options can still set `WINEDLLOVERRIDES` after it.

The crack's loader DLL still needs its own `native,builtin` override, as for
OnlineFix's proxy DLLs above. For anything not detected, add it with a
[launch rule](launch-rules.md).
