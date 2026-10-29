# Launch rules

A launch rule adds launch options to every game, or to every game whose folder
contains one of its files. Use rules for fixes a whole kind of game needs and
for things you want everywhere, such as HDR, so they don't have to be typed
into each game. They are edited in **Settings → Launch rules**.

## A rule

| Field                 | Meaning                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Enabled               | Whether the rule applies to the games it matches. Each game can still turn it on or off for itself.                                             |
| Name                  | Shown in each game's options.                                                                                                                   |
| Applies to            | **Every game**, or **Games containing these files**.                                                                                            |
| Files                 | For file-based rules: file or folder names, comma-separated. Case is ignored and `*` matches anything (`*protected*.exe`). One match is enough. |
| Launch options to add | Launch options in the usual format: `VARIABLE=1 %command% -argument`.                                                                           |
| Actions               | Linux: a Proton build, MangoHud, GameMode and gamescope. See [Proton builds and launch tools](proton-and-launch-tools.md#launch-rule-actions).  |

Hydra looks for the files in the game folder and up to six levels below it.
For Unreal Engine games started from `<Project>/Binaries/Win64`, the game
folder is the one that contains `<Project>`.

## Per game

A game's **General** options list every rule that matches it: rules for every
game, and file-based rules whose files it contains (with the file that
matched). For each one, the game either follows the rule's **Enabled** setting
or sets its own:

- tick or untick the rule to turn it on or off for that game only;
- **Follow the rule** makes the game follow the rule's setting again.

So a rule can be on everywhere except a few games, or off everywhere and
turned on only where it is wanted. Below the rules, the options show
everything Hydra adds in front of the game's own launch options.

## How rules combine

At launch, Hydra builds the launch options in layers. Each later layer wins
when two set the same variable, and `WINEDLLOVERRIDES` lists are combined
instead:

1. The DLL overrides [OptiScaler](optiscaler.md) and
   [OnlineFix games](online-fix.md) need on Linux, and
   [`lsteamclient=d`](online-fix.md#steam-emulators-and-protons-steam-bridge)
   for every Windows game. The first two stay separate features because they
   also install or copy files.
2. The launch rules that apply to the game, in the order they are listed,
   then the gamescope wrapper of the last rule that runs the game in
   gamescope.
3. The [default launch options](default-launch-options.md).
4. The game's own launch options.

## Launch command preview

**Show launch command** under a game's launch options shows what launching it
would run right now, without starting it:

- the full command line, with every environment variable, the `umu-run`
  invocation (or the native executable) and the wrappers (`gamemoderun`),
  ready to copy into a terminal;
- the Proton build and where it comes from (picked for the game, a launch
  rule, the default from settings, or umu-run's own default);
- the Wine prefix, the combined launch options, the rules that applied and the
  working folder.

The preview warns when the launch command contains a wrapper that manages
OptiScaler and MangoHud itself (GOverlay's `bgmod`/`fgmod`): it deletes the
OptiScaler files Hydra installed and replaces Hydra's MangoHud layout. See
[OptiScaler](optiscaler.md#files-removed-outside-hydra).

It uses the same code as a real launch, so it is the way to check what a rule
or default actually changes. Games inside a Steam library are launched by
Steam with Steam's own launch options; the preview says so.

## Built-in rules

A new install starts with these. They can be edited, disabled or removed;
**Restore built-in rules** brings back removed ones.

| Rule                               | Applies to                                                                    | Adds                                                               | Default |
| ---------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------- |
| HDR                                | Every game                                                                    | `PROTON_ENABLE_WAYLAND=1 PROTON_ENABLE_HDR=1 DXVK_HDR=1 %command%` | Off     |
| HDR: switch the monitor (Hyprland) | Every game                                                                    | `hypr-hdr %command%`                                               | Off     |
| ReShade                            | `ReShade.ini`                                                                 | `WINEDLLOVERRIDES=dxgi=n,b;d3d9=n,b;opengl32=n,b %command%`        | On      |
| Unity games: Vulkan renderer       | `UnityPlayer.dll`                                                             | `%command% -force-vulkan`                                          | Off     |
| Denuvo bypass (linuwux)            | `artifact.dll`, `artifact.json`, `DenuvOwO.dll`, `DenuvOwO.ini`, `Reflex.ini` | `linuwux %command%`                                                | On      |

### HDR

The HDR rule runs games through Proton's Wayland driver with HDR on.
`PROTON_ENABLE_HDR` is what Valve Proton and GE-Proton read;
Proton-CachyOS only honours `DXVK_HDR`. HDR also needs a compositor and
display with HDR support, the game in fullscreen, and HDR switched on in the
game's own settings. Games that break under the Wayland driver (some launchers
and anti-cheat) can turn the rule off and use
`gamescope -f --hdr-enabled -- %command%` in their launch options instead.

Installs that used the earlier HDR switch are moved onto this rule
automatically, keeping the global setting and each game's choice.

### HDR: switch the monitor (Hyprland)

For games that never offer HDR even with the rule above. Wine's Wayland
driver reports a monitor as HDR-capable only while the compositor already has
it in HDR, and Hyprland's `render:cm_auto_hdr` switches a monitor only after
a game asks for HDR, so a game that checks at startup never asks. The rule
wraps the game in `hypr-hdr`, which puts the monitor in HDR before the game
starts and back afterwards.

It is off for every game. Turn it on in a game's **General** options (the rules that match it are listed there)
for the games that need it, or on here to use it everywhere. After an update
it appears under **Restore built-in rules**.

`hypr-hdr` is not part of Hydra: it has to be on `PATH` (for example in
`~/.local/bin`), and a game fails to start with the rule on and no such
command. It takes the game command, so any script that does this works:

1. switch the monitor to HDR (`hyprctl eval 'hl.monitor({ …, cm = "hdr" })'`,
   with the monitor's current mode, position and scale);
2. run the command, passing on its exit status and any signal;
3. switch the monitor back, but only if the script switched it.

It affects one monitor, so the game must open on it and run fullscreen. The
rule changes nothing in the Hyprland configuration.

### ReShade

For games that already have a `ReShade.ini`. ReShade loads as `dxgi.dll`,
`d3d9.dll` or `opengl32.dll` next to the game, and Wine only uses such a file
when the name is overridden, so the rule overrides all three; a name the game
folder does not have costs nothing. It does not override `d3dcompiler_47`:
that asks Wine for a native copy, and a prefix without one cannot start the
game. ReShade works with Wine's own. Saved rules that still had the old
override are updated automatically.

### Denuvo bypass (linuwux)

The Denuvo bypass rule wraps games that contain DenuvOwO or ARTIFACT crack
files with [linuwux](https://github.com/brcly/linuwux-runtime), a small
LD_PRELOAD runtime that makes these cracks work under Proton on Linux without
a patched Proton build. `linuwux` must be installed separately — run the
installer from the repository's README. Your CPU must also support or emulate
`cpuid_fault`, and UMIP must be disabled (`clearcpuid=514` kernel parameter)
on Intel 9th gen+ and AMD Ryzen 3000+. If `linuwux` is not in PATH, edit the
rule to use the full path (e.g. `/home/user/.local/bin/linuwux %command%`).

## Sharing rules

**Copy rules** puts every rule on the clipboard as JSON; **Paste rules** on
another install adds them. Pasted rules replace rules with the same id, so
pasting an updated copy again does not create duplicates.
