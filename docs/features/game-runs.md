# Game runs

Every launch from Hydra leaves a record: what was started, with which Proton
build and tools, how it ended, and copies of the logs that belong to it. The
point is that a game that broke can be looked at afterwards, by you or by
Claude Code, without launching it again.

The runs are listed in the game's **Options → Runs**. It is the only place
they are shown.

## What a run records

- When it started and how long it lasted.
- **How it ended:**
  - **Ended:** exit code 0, or the code was not known.
  - **Error:** any other exit code, or the game was killed by a signal.
  - **Closed early:** it ended within a minute and the game was never seen
    running.
  - **Didn't start:** nothing could be launched.
  - **Unknown:** Hydra was closed while the game ran.
- The launcher (Proton through umu, Wine, or native), the Proton build (or
  "umu's default" when none was chosen) and the Wine prefix.
- The full launch command and the environment Hydra added: launch rules, DLL
  overrides, `PROTON_*` variables.
- The tools Hydra installed in the game, with their versions: OptiScaler,
  ReShade and RenoDX, OnlineFix.
- Events during the launch, such as umu-run failing and Hydra trying Wine
  instead.

## Logs

Copied into the run's folder when the run ends:

| File              | From                                                             |
| ----------------- | ---------------------------------------------------------------- |
| `umu.log`         | This run's part of the game's umu log, launch line onwards       |
| `proton.log`      | Proton's own log (`PROTON_LOG=1`), which every launch overwrites |
| `ReShade.log`     | The game folder, also used by RenoDX                             |
| `OptiScaler.log`  | The game folder                                                  |
| `game-output.log` | A native game's stdout and stderr, written straight into the run |

A log only counts when it changed during the run; a leftover from an earlier
launch is not copied. Logs over 5 MB keep only their end, and the summary says
so.

## Where runs are kept

`<userData>/runs/<game>--<shop>-<id>/<run id>/`, for example
`~/.config/hydra-plus/runs/sekiro--custom-abc123/2026-10-29T12-00-00Z/`. The game
part of the name starts with the title the game had when its first run was
recorded and keeps that name when the title changes. Each run folder holds:

- `run.json`: the record, for tools.
- `summary.md`: the same record as text.
- The log copies.

`latest` in each game's folder is a link to its newest run. The newest 20
runs per game are kept and older ones are deleted when a new run starts.

**Copy diagnostics** puts a run's `summary.md` on the clipboard. It includes
the run folder's path, so the summary is enough to hand to Claude Code; telling
it "look at `runs/<game>/latest`" works too.

## When a run ends

Hydra knows two things: when the launcher process exits (with its exit code)
and when the process watcher stops seeing the game. A run ends when both have
happened. A launcher that starts the game and quits does not end the run: if
the game shows up within 15 seconds, the run lasts until the game closes. If
the game closes and the launcher has not exited 30 seconds later, the run ends
without an exit code.

Games started through `shell.openPath` (Windows, no launch options) have no
process handle, so their runs have no exit code or output.

## Not yet

- Runs are not shown outside the game's options; the planned compatibility
  overview (roadmap phase 12) will list the last run of every game.
- Tool-specific checks of the logs (RenoDX failing to set the colour space,
  OptiScaler not loading) come with the checked first run in the same phase.
