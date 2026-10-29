# Tools and fixes

Each game's **Options → Tools** lists what Hydra applies to it, sets each item
to **Auto**, **On** or **Off**, and says why it is on or off. It is the one
place a game's tools are switched; the other tabs hold their details
(versions, DLL names, layouts) and link here.

| Capability              | Platforms | Auto means                                                                                          |
| ----------------------- | --------- | --------------------------------------------------------------------------------------------------- |
| OnlineFix               | Linux     | Loaded when OnlineFix files are found; there is no On, as there would be nothing to load            |
| HDR                     | Linux     | The built-in HDR launch rule's setting for every game                                               |
| HDR: switch the monitor | Linux     | The `hypr-hdr` launch rule's setting for every game                                                 |
| RenoDX HDR mod          | All       | Installed during setup when a mod exists and **Settings → RenoDX** installs automatically           |
| OptiScaler              | All       | Installed during setup when the game qualifies and **Settings → OptiScaler** installs automatically |
| MangoHud, GameMode      | Linux     | The global setting, or a launch rule that turns it on                                               |

Tools apply to Windows games only, except MangoHud and GameMode, which wrap
any game.

## Auto, On and Off

- **Auto** lets Hydra decide, using the global settings and what it detects
  in the game folder. The reason line says which.
- **On** forces it for this game. For RenoDX and OptiScaler that installs now,
  even when automatic installs are off, and the setup step keeps it installed.
- **Off** stops it for this game. For RenoDX and OptiScaler that removes what
  Hydra installed and keeps it from coming back.

Each row shows whether the capability is **Active** (applies at the next
launch, or is installed), **Inactive**, or **Blocked**: wanted but not
possible, for example the monitor switch off Hyprland, MangoHud not installed,
or RenoDX set to On for a game with no mod.

## The reasons

Each row says what decided it: a setting for every game (and where to change
it), this game's own choice, a launch rule, or what Hydra found. For example
"FromSoftware Engine is available. Automatic installs are off in Settings →
RenoDX", "No DLSS, FSR or XeSS found, and the game is not on OptiScaler's
list", "Not installed automatically: the game ships EasyAntiCheat. Set to On
to install it anyway".

## Where the choice is stored

Each capability keeps the field it used before, so older code and existing
choices carry over:

| Capability         | Off                         | On                          |
| ------------------ | --------------------------- | --------------------------- |
| OnlineFix          | `onlineFixDisabled`         | none                        |
| HDR rules          | `launchRuleOverrides[rule]` | `launchRuleOverrides[rule]` |
| RenoDX, OptiScaler | `*AutoInstallDisabled`      | `capabilityOverrides.<id>`  |
| MangoHud, GameMode | `capabilityOverrides.<id>`  | `capabilityOverrides.<id>`  |

A MangoHud or GameMode switch that was ticked before (`autoRunMangohud`,
`autoRunGamemode`) reads as On. Before Tools, a game could not turn MangoHud or
GameMode off while it was on for every game; now Off wins.

## Not yet

Planned in [roadmap phase 12](../roadmap.md#see-and-steer-what-hydra-does-to-a-game):
the Proton build and frame generation as capabilities, dependencies (RenoDX
turning on the HDR rules and asking for a Proton build with Wayland HDR,
instead of writing the HDR rules' overrides as it does now), a check of the
first run after an automatic change, and one page of global defaults.
