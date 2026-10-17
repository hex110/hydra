# HDR

On Linux, Hydra can launch games with HDR through Proton's Wayland driver.

- **Settings → Compatibility → HDR → Enable HDR for every game** turns it on
  for all Windows games.
- **Enable HDR** under a game's launch options overrides that for one game;
  **Use the default** makes it follow the global setting again.

When HDR is on, Hydra adds these variables at launch:

| Variable                  | Why                                                                           |
| ------------------------- | ----------------------------------------------------------------------------- |
| `PROTON_ENABLE_WAYLAND=1` | HDR needs Wine's Wayland driver; through XWayland the game cannot output HDR. |
| `PROTON_ENABLE_HDR=1`     | The switch Valve Proton and GE-Proton read.                                   |
| `DXVK_HDR=1`              | Read by DXVK and `winewayland` directly; Proton-CachyOS only honours this.    |

Variables in the game's own launch options win, so `DXVK_HDR=0` there still
disables it.

HDR also needs:

- a compositor and display with HDR support (KDE Plasma 6, GNOME 48 or newer,
  Hyprland, gamescope);
- the game in fullscreen, exclusive or borderless;
- HDR switched on in the game's own settings.

Games that break under Proton's Wayland driver (some launchers and anti-cheat)
can use gamescope instead, through the launch options:
`gamescope -f --hdr-enabled -- %command%`, with HDR left off for that game.
