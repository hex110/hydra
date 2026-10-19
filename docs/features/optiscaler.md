# OptiScaler

[OptiScaler](https://github.com/optiscaler/OptiScaler) hooks a game's DLSS,
FSR or XeSS and replaces it with the upscaler of your choice (FSR 4 and XeSS
on any GPU, DLSS on NVIDIA), and can add frame generation. Hydra downloads it,
installs it into games, keeps track of what it changed and removes it cleanly.

Settings live in **Settings → OptiScaler**. Each game has an **OptiScaler**
page in its options.

## Automatic installation

With **Install OptiScaler automatically in games that support it** on, Hydra
installs OptiScaler as part of [game setup](game-setup.md), after the Wine
prefix is created. Setup runs when a download finishes, when a library scan
adds or links a game and when a game gets a new executable.

A game qualifies when either check below is enabled and passes:

| Check                               | Passes when                                                                                                                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Games that ship DLSS, FSR or XeSS   | The game folder contains `nvngx_dlss.dll`, `libxess.dll`, `amd_fidelityfx_dx12.dll`/`_vk.dll`/`_upscaler_dx12.dll`, an `ffx_fsr2_api_*.dll`/`ffx_fsr3upscaler_x64.dll`, or `sl.interposer.dll`. |
| Games listed as working on the wiki | The game's title matches a working entry on the [compatibility list](https://github.com/optiscaler/OptiScaler/wiki/Compatibility-List). The list is downloaded daily.                           |

A game is never installed automatically when:

- the compatibility list reports it as not working (almost always anti-cheat);
- OptiScaler is already present but was not installed by Hydra (an
  `OptiScaler.ini` without Hydra's manifest, for example from OptiScaler
  Client or a manual install);
- the game is opted out, either with **Never install OptiScaler automatically
  in this game** or by removing OptiScaler from it in Hydra;
- the game is owned by another launcher (Steam installs, Epic imports).

Games that build their upscaler into the executable (common in Unreal Engine
games) are only detected through the compatibility list. You can install
OptiScaler into any Windows game by hand from its options.

**Install in all supported games** on the settings page runs the same checks
over the whole library, including games added before the setting was turned
on. It ignores the automatic installation toggle but respects opt-outs.

## Where it is installed

OptiScaler goes next to the game's executable. For Unreal Engine games
launched through a bootstrap executable at the root of the game, Hydra
follows it to `<Project>/Binaries/Win64`, where the `-Shipping` executable
is.

`OptiScaler.dll` is renamed to the **Install OptiScaler as** DLL (`dxgi.dll`
by default). Pick `winmm.dll` or `version.dll` when a game ignores
`dxgi.dll` or already uses one, such as ReShade. Each game can override the
default; reinstall to apply a change.

For games the compatibility list marks as OptiPatcher-supported, Hydra also
installs [OptiPatcher](https://github.com/optiscaler/OptiPatcher) into
`plugins/` and sets `LoadAsiPlugins=true`. It exposes DLSS inputs on AMD and
Intel GPUs without GPU spoofing. Turn it off with **Install OptiPatcher in
supported games**.

## Configuration overrides

**Configuration overrides** is an INI fragment applied to the release's
`OptiScaler.ini` on every install:

```ini
[Menu]
ShortcutKey=0x78

[Spoofing]
Dxgi=false
```

Keys replace the same key in the same section; unknown keys and sections are
added. Changes saved from the in-game overlay stay until OptiScaler is
reinstalled or updated, so put anything you want to keep here.

## Linux

Under Wine the proxy DLL must be loaded from the game folder instead of Wine's
builtin. When Hydra launches a game with OptiScaler, it adds
`WINEDLLOVERRIDES=<proxy>=n,b` to the launch options, merged with any
`WINEDLLOVERRIDES` from the game or the
[default launch options](default-launch-options.md). Games launched through
Steam need the override in their Steam launch options.

## Versions and updates

**Release channel** selects stable releases from `optiscaler/OptiScaler` or
nightly builds from `optiscaler/OptiScaler-nightly`. Hydra checks GitHub for
a new release at most every six hours and downloads it the first time it is
installed into a game. Releases are cached in `<userData>/optiscaler/releases`;
**Clear downloads** deletes them without affecting games.

Installed games are not updated on their own. The settings page shows how many
have an older version and **Update N games** reinstalls them; a single game
can be updated from its options. A game's options can also install an older
release that is still downloaded (**Version**), for going back when a new
OptiScaler breaks a game; the newest one is the default.

## Removing and restoring

Every install writes `.hydra-optiscaler.json` next to the installed files. It
lists each file and folder Hydra created and each game file it replaced. The
replaced files are moved to `.hydra-optiscaler-backup/` first.

**Remove** deletes exactly the listed files plus OptiScaler's logs, puts the
backed-up files back, deletes the folders Hydra created if they are empty and
opts the game out of automatic installation. Files you added yourself, for
example other ASI plugins in `plugins/`, are kept.

## Files removed outside Hydra

Before each launch, Hydra compares the manifest with the files on disk. When
some are gone, it reinstalls the same version from the release cache and
launches. If that release is no longer downloaded, or the reinstall fails, the
game launches without them. Either way the
[setup log](game-setup.md#setup-log) gets an OptiScaler entry ("before a
launch"), a notification names the game, and the game's OptiScaler page lists
the missing files until it is reinstalled.

Tools that manage OptiScaler themselves conflict with Hydra's install.
GOverlay's `bgmod` wrapper (also called `fgmod`) deletes every OptiScaler file
it did not install on each launch, keeping only the proxy DLL, so OptiScaler
then runs with its defaults. When `bgmod` or `fgmod` is in a game's launch
command (its own launch options, the default launch options or a launch rule),
Hydra does not reinstall the files, because the wrapper would delete them
again. The OptiScaler page and the [launch command
preview](launch-rules.md#launch-command-preview) both warn about the wrapper;
remove it from the launch command.

If the manifest itself is deleted, the game's OptiScaler page shows OptiScaler
as not installed.
