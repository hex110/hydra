# In-game overlay: design

Roadmap phase 18, written 2026-11-01. Steam's overlay is the reference:
**Shift+Tab** opens a panel over the game (achievements, friends, a browser,
guides, screenshots, notes), and notifications (achievements, friends) pop up
in a corner while you play.

## How others do it on Linux

- **Steam** injects its overlay into the game: `gameoverlayrenderer.so`
  through `LD_PRELOAD` for OpenGL, and implicit Vulkan layers
  (`VK_LAYER_VALVE_steam_overlay_32/64`) for Vulkan. Proton's D3D games render
  through DXVK or VKD3D-Proton, which are Vulkan, so the layer covers them.
  The overlay draws into the game's own frames, and Steam hooks the game's
  input to take the mouse and keyboard while it is open.
- **MangoHud** is the same kind of Vulkan layer (and an OpenGL preload),
  drawing with Dear ImGui. It has keyboard toggles but no mouse input.
- **ReShade** (in Hydra's RenoDX games) draws an overlay with full input
  inside D3D games under Proton, and takes add-ons that can add their own
  windows.
- A **separate window** above the game does not work on Wayland: an app can't
  place itself above a fullscreen window or keep focus away from the game.
  Upstream Hydra knows this: on Linux its achievement popup never draws over
  a game; it shows in Hydra's window when that is focused, else as a desktop
  notification (`achievement-unlock-notifications.ts`). Hyprland's
  layer-shell overlay layer would work, but Electron can't create
  layer-shell surfaces, and it would be Hyprland-only.

So anything that has to appear **in** the game has to be drawn by something
inside the game's rendering: a Vulkan layer.

## The stages

1. **In-game notices through MangoHud** (done 2026-11-01). MangoHud reloads
   its config file whenever it changes (inotify; checked with MangoHud 0.8.4
   in a headless gamescope running `vkcube`). Hydra already writes a config
   per game for its MangoHud layouts; a notice is a `custom_text_center=` line
   added to that file for six seconds. Games without a MangoHud layout get a
   config with every stat off, so nothing shows but the notices. On by
   default where MangoHud is installed (**Settings → Notifications → Show
   achievements inside the game**). See
   [In-game notices](features/in-game-notices.md).
2. **An overlay panel on a hotkey.** What Steam's Shift+Tab shows, from Hydra's
   data: achievements with progress, the session's playtime, notes, the tools
   running in the game (OptiScaler's and ReShade's menu keys), screenshots.
   The hotkey can be global without the game's cooperation: the
   GlobalShortcuts portal (Electron's `GlobalShortcutsPortal` feature;
   `xdg-desktop-portal-hyprland` implements it). Where the panel draws is the
   open question:
   - a Hydra window on the other monitor, or after the game is minimised
     (works everywhere, not "in" the game);
   - a Hydra-owned Vulkan layer (a MangoHud fork, MIT) drawing the panel
     with ImGui, taking keyboard input through a Hyprland submap while open
     (`hyprctl dispatch submap`), so keys go to Hydra instead of the game.
     This is the Steam-like result; it is native C++ shipped as a layer with
     its manifest, and Hyprland-specific for input.
     Decide with the owner before building; a hand test in a real game is
     needed either way.
3. **A ReShade add-on** for games with ReShade: a Hydra window inside
   ReShade's overlay (F10), with mouse input, reading Hydra's data from a
   file in the prefix. It is a Windows DLL, built in CI (no MinGW here).

## Notices: details

- Only games Hydra launches with its config get notices, since the config
  path is passed as `MANGOHUD_CONFIGFILE`. A user who runs MangoHud with its
  own `~/.config/MangoHud/MangoHud.conf` (MangoHud on, no Hydra layout) is
  left alone and gets no notices.
- Lines are sanitised to one line, so a title can't add config keys.
- The config is written atomically (temp file and rename), which MangoHud's
  inotify watch picks up, and restored when the game closes.
- More than three unlocks at once show as one count line.
