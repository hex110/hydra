# In-game notices

Achievement unlocks show inside the running game, at the top centre, for six
seconds: "Achievement unlocked: …", or "5 achievements unlocked" for a burst.
Stage 1 of the [overlay design](../overlay-design.md).

## How

Hydra launches the game with `MANGOHUD_CONFIGFILE` pointing at a config it
writes, and MangoHud reloads that file when it changes. A notice is a
`custom_text_center=` line added to the file and removed when its time is up
(`src/main/services/in-game-notices*.ts`).

- A game with a MangoHud layout (game options or the default in settings)
  shows the notice in its HUD.
- A game without one is started with MangoHud and a config that shows nothing
  but the notices (`notices-<shop>-<id>.conf` in `<userData>/mangohud/`).
- A game the user runs with MangoHud's own config (MangoHud on, no Hydra
  layout) gets no notices: Hydra doesn't replace that config.

## Settings

**Settings → Notifications → Show achievements inside the game**, Linux
only. On by default where `mangohud` is installed; it explains itself and is
greyed out when MangoHud is missing, and follows **When an achievement is
unlocked**. The desktop notification still shows as before.

## Checking it

Without a game: run `vkcube` under MangoHud in a headless gamescope and
capture it:

```sh
DISABLE_LSFGVK=1 MANGOHUD_CONFIGFILE=/path/notices.conf \
  gamescope --backend headless -W 1280 -H 720 -- mangohud vkcube &
gamescopectl screenshot /tmp/shot.png
```

Edit the config while it runs and take another screenshot.
