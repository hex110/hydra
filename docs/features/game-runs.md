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
  - **Unknown:** Hydra was closed, crashed or was killed while the game ran.
    Runs left like this are marked when Hydra next starts, with an event
    saying so.
- The launcher (Proton through umu, Wine, or native), the Proton build (or
  "umu's default" when none was chosen) and the Wine prefix.
- The full launch command and the environment Hydra added: launch rules, DLL
  overrides, `PROTON_*` variables.
- The tools Hydra installed in the game, with their versions: OptiScaler,
  ReShade and RenoDX, OnlineFix.
- Events during the launch, such as umu-run failing and Hydra trying Wine
  instead.

## Logs

The ending is saved as soon as the run ends. The logs are copied into the
run's folder three seconds later, once umu and Proton have finished writing; if
Hydra quits in between (a reboot right after the game closes), the run keeps
its ending but has no logs:

| File              | From                                                             |
| ----------------- | ---------------------------------------------------------------- |
| `umu.log`         | This run's part of the game's umu log, launch line onwards       |
| `proton.log`      | Proton's own log (`PROTON_LOG=1`), which every launch overwrites |
| `ReShade.log`     | The game folder, also used by RenoDX                             |
| `OptiScaler.log`  | The game folder                                                  |
| `game-output.log` | A native game's stdout and stderr, written straight into the run |

Proton writes its log to `<userData>/logs/proton/steam-<id>.log`, one file
per game that every launch overwrites, not to your home folder. With
`PROTON_LOG_DIR` set in Hydra's environment, Proton writes there instead.

A log only counts when it changed during the run; a leftover from an earlier
launch is not copied. Logs over 5 MB keep only their end, and the summary says
so.

## Checks

When a run ends, Hydra reads the copied logs and the ending for each tool it
installed (RenoDX, OptiScaler) and records a **check** in `run.json` and the
summary: ok, failed, or unclear. Non-ok checks show under the run in
**Options → Runs**. What counts as failed, and what the first run after an
automatic install does with it, is in
[Tools and fixes](game-tools.md#the-first-run-is-checked). Runs recorded
before checks existed have none, and a run whose end Hydra did not see has
none.

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
