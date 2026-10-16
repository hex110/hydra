# Default launch options

**Settings → Compatibility → Default launch options** sets launch options that
Hydra applies to every game it launches, on top of each game's own launch
options (**Game options → General → Launch options**).

## How the two are combined

Both values use the same syntax as per-game launch options. When both are set,
Hydra merges them at launch time; neither value is rewritten on disk.

| Part | Rule |
|---|---|
| Environment variables (`NAME=value` before `%command%`) | Both are kept. If both set the same variable, the game's value wins. `WINEDLLOVERRIDES` is the exception: both lists are joined with `;`. |
| Wrapper commands (between the variables and `%command%`) | The defaults wrap the game's own wrappers. |
| Arguments (after `%command%`, or the whole value when there is no `%command%`) | Default arguments come first, then the game's. |

Example:

```text
Default:  PROTON_ENABLE_WAYLAND=1 gamemoderun %command% -skipintro
Game:     DXVK_HUD=fps mangohud %command% -dx12
Launched: PROTON_ENABLE_WAYLAND=1 DXVK_HUD=fps gamemoderun mangohud %command% -skipintro -dx12
```

## Opting a game out

When default launch options are set, the game's launch options section shows
them and offers **Don't apply the default launch options**. This is stored per
game (`ignoreDefaultLaunchOptions`).

## Scope

Defaults apply to every launch Hydra performs itself: native executables,
Wine/Proton (umu) launches and Epic games managed by Hydra. Games launched
through the Steam client use Steam's own launch options instead.
