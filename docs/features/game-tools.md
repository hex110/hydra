# Tools and fixes

Each game's **Options → Tools** lists what Hydra applies to it, sets each item
to **Auto**, **On** or **Off**, and says why it is on or off. It is the one
place a game's tools are switched; the other tabs hold their details
(versions, DLL names, layouts) and link here.

| Capability              | Platforms | Auto means                                                                               |
| ----------------------- | --------- | ---------------------------------------------------------------------------------------- |
| OnlineFix               | Linux     | Loaded when OnlineFix files are found; there is no On, as there would be nothing to load |
| HDR                     | Linux     | The built-in HDR launch rule's setting for every game                                    |
| HDR: switch the monitor | Linux     | The `hypr-hdr` launch rule's setting for every game                                      |
| RenoDX HDR mod          | All       | Installed during setup when a mod exists and **Tool defaults** is Auto                   |
| OptiScaler              | All       | Installed during setup when the game qualifies and **Tool defaults** is Auto             |
| MangoHud, GameMode      | Linux     | The global setting, or a launch rule that turns it on                                    |

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

## Dependencies

A capability can need other things to have any effect. They are listed under
its row, each as **Has** or **Missing**, and a capability that is wanted but
cannot work shows as **Blocked** with the first missing need as its reason,
instead of a silent no-HDR.

RenoDX needs:

- **The HDR launch rule.** With RenoDX installed and **Settings → RenoDX → Turn
  on the HDR launch rules** on, the game launches with the HDR rule on. The
  HDR row reads "Turned on because RenoDX needs it". Nothing is written to the
  game: setting the HDR row to Off keeps it off and shows RenoDX as blocked.
- **The monitor switch**, on Hyprland with `hypr-hdr` only. Elsewhere the
  compositor is yours to set and the need is not listed.
- **A Proton build with Wayland HDR.** GE-Proton 11 and later work; umu's
  default (UMU-Proton 10) does not and is reported as missing. Other builds are
  not tested, so they show as "not tested" and do not block.

Games that got RenoDX before this existed kept the HDR overrides it wrote; they
show as On for this game.

## The first run is checked

When Hydra installs RenoDX or OptiScaler by itself (during setup, or because
the mode was set to Auto and the game qualifies), the game's next run is
checked. Set to On is your own call and is not checked.

The check reads the finished run's [record](game-runs.md#checks):

- RenoDX fails when `ReShade.log` has `ChangeColorSpace` failing, which means
  the swapchain could not go HDR.
- Either tool fails when the game ended within a minute of starting without
  ever being seen running, or exited with an error within a minute. A crash
  after a long session is not blamed on the tools.
- A missing log is "unclear", not a failure: OptiScaler only writes
  `OptiScaler.log` when its `LogToFile` is on. An unclear check stays pending
  and the next run is checked instead.

A failed check marks the row **Failed** ("Auto: failed"), says why, and sends a
notification that opens the Tools tab. The tool stays installed. **Off**
removes what Hydra installed and keeps it from coming back; **On** keeps it
and stops the check. Any choice clears the failure, and a passed check clears
silently.

## Defaults for every game

**Settings → Tool defaults** is the one page of global settings for these
tools. Each row is a setting for every game that does not say otherwise:

| Tool                     | Choices       | What it replaces                                                |
| ------------------------ | ------------- | --------------------------------------------------------------- |
| RenoDX, OptiScaler       | Auto, Never   | The "install automatically" switches on their settings pages    |
| OnlineFix                | Auto, Never   | "Prepare OnlineFix games" in Compatibility                      |
| HDR, HDR: switch monitor | Never, Always | The built-in launch rules' on/off in Launch rules (still there) |
| MangoHud, GameMode       | Never, Always | The two switches in Compatibility                               |

Auto lets Hydra decide for each game and say why in the game's Tools options.
RenoDX and OptiScaler have no Always: forcing a tool into a game that does not
fit it would break it, so the furthest a default goes is Auto. MangoHud,
GameMode and the HDR rules are plain on/off, so they have no Auto. A game's
own Auto, On or Off, and a launch rule that turns a tool on, still win. The
choices are stored in the same preferences as before, so nothing needed to
migrate. The other settings on the RenoDX and OptiScaler pages (versions, beta
mods, the INI fragments) stay where they were.

## Games and tools

**Settings → Games and tools** lists every library game with an executable
against OnlineFix, RenoDX and OptiScaler, how its last run ended, and whether an
update is waiting. A game's name opens its Tools options. The filter shows
games whose last run failed, games where a tool failed its first run, games
with RenoDX or OptiScaler installed, games with a tool set to Off, and games
with an update.

The row for a tool says **Active** (installed, or OnlineFix files loaded),
**Active (On)** when it was set to On, **Off**, or **Failed**; a dash means not
installed or not applicable (a native game has no tools). The last run is read
from the game's newest [run](game-runs.md), without opening the others.

Below the list, **All games at once** holds the bulk buttons that used to be on
the RenoDX and OptiScaler pages: install in every game that qualifies, and
update every installed copy. They ignore the Tool defaults choice but respect a
game's own Off.

## Not yet

Planned in [roadmap phase 12](../roadmap.md#see-and-steer-what-hydra-does-to-a-game):
frame generation as a capability. The overview has no "skipped automatically"
filter (that needs each game's eligibility worked out, which is slow for a
whole library), and no bulk action beyond the two install buttons.
