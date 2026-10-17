# Launch rules

A launch rule adds launch options to every game whose folder contains one of
its files. Use rules for fixes a whole kind of game needs, so they don't have
to be typed into each game. They are edited in **Settings → Launch rules**.

## A rule

| Field                                 | Meaning                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Enabled                               | Off keeps the rule without applying it anywhere.                                                                          |
| Name                                  | Shown in each game's options.                                                                                             |
| Applies when the game folder contains | File or folder names, comma-separated. Case is ignored and `*` matches anything (`*protected*.exe`). One match is enough. |
| Launch options to add                 | Launch options in the usual format: `VARIABLE=1 %command% -argument`.                                                     |

Hydra looks for the files in the game folder and up to six levels below it.
For Unreal Engine games started from `<Project>/Binaries/Win64`, the game
folder is the one that contains `<Project>`.

## How rules combine

At launch, Hydra builds the launch options in layers. Each later layer wins
when two set the same variable, and `WINEDLLOVERRIDES` lists are combined
instead:

1. What Hydra adds itself on Linux: [HDR](hdr.md), and the DLL overrides
   [OptiScaler](optiscaler.md) and [OnlineFix games](online-fix.md) need.
2. Matching launch rules, in the order they are listed.
3. The [default launch options](default-launch-options.md).
4. The game's own launch options.

A game's **General** options list the rules that matched it, with the file
that triggered each, and show everything Hydra adds in front of the game's
own launch options. Unticking a rule there turns it off for that game only.

## Built-in rules

A new install starts with these. They can be edited, disabled or removed;
**Restore built-in rules** brings back removed ones.

| Rule                         | Files             | Adds                                                   | Default |
| ---------------------------- | ----------------- | ------------------------------------------------------ | ------- |
| ReShade                      | `ReShade.ini`     | `WINEDLLOVERRIDES=d3dcompiler_47=n;dxgi=n,b %command%` | On      |
| Unity games: Vulkan renderer | `UnityPlayer.dll` | `%command% -force-vulkan`                              | Off     |

## Sharing rules

**Copy rules** puts every rule on the clipboard as JSON; **Paste rules** on
another install adds them. Pasted rules replace rules with the same id, so
pasting an updated copy again does not create duplicates.
