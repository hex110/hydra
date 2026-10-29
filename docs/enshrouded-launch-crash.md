# Enshrouded crashes at swapchain creation

Status as of 2026-10-29 13:30 (local, UTC+2): **cause found**. The rest of the
file is the investigation as it went, kept so nobody redoes it.

## Cause

OptiScaler, installed as `dxgi.dll`. Enshrouded renders through Vulkan but also
loads `d3d12`/`dxgi`, so OptiScaler gets loaded, **after** the game has already
created its `VkInstance` and `VkDevice`. Its Vulkan overlay menu hooks
`vkGetSwapchainImagesKHR`, and in that hook calls
`vkGetPhysicalDeviceQueueFamilyProperties` with the physical device it would
have captured from `vkCreateDevice`, which it never saw. That device is NULL,
and winevulkan calls through a NULL dispatch entry.

Evidence (`WINEDEBUG=+vulkan,+loaddll`):

```
thunk64_vkCreateSwapchainKHR 0x72e860, ...           <- succeeds
thunk64_vkGetSwapchainImagesKHR 0x72e860, ..., 0x6ffff980b4cc, ...
thunk64_vkGetPhysicalDeviceQueueFamilyProperties (nil), 0x10c860, (nil)
Exception 0xc0000005 at winevulkan.so + 0x2b980
```

`0x6ffff980b4cc` lies inside `<game>\dxgi.dll` (loaded at `0x6FFFF7EE0000`,
26.6 MB), so the swapchain is in fact created; the crash comes just after,
before the game logs `swap chain created`.

| Test (GE-Proton11-10, Hydra's env otherwise)                 | Result        |
| ------------------------------------------------------------ | ------------- |
| `VK_LOADER_LAYERS_DISABLE='~implicit~'` (loader confirmed)   | crash         |
| `dxgi=b` (Wine's builtin, game-folder `dxgi.dll` not loaded) | **swapchain** |
| OptiScaler loaded, `[Menu] OverlayMenu=false`                | **swapchain** |
| OptiScaler renamed to `dbghelp.dll`, `dbghelp=n,b`           | **swapchain** |

**Fix:** reinstall OptiScaler for the game. The install dates from 01:07, before
the proxy-name picker (`9c7a3eb95`, 01:42) existed. The picker now chooses
`dbghelp.dll` from the OptiScaler wiki, because the crack owns `winmm.dll`.
Loaded that early, OptiScaler sees device creation and the overlay works.

Why the 01:07:24 run survived with `dxgi.dll` in place is still unexplained.
The earlier "`dxgi=n,b` removed" test was not a valid OptiScaler-off test:
Proton already overrides `dxgi` to native for DXVK, and the game folder comes
first in the search order, so OptiScaler kept loading.

## Summary

Enshrouded (Steam app 1203620, AnkerGames RUNE crack release, native Vulkan
renderer) starts under Hydra Plus + umu + Proton, gets through Steamworks init,
then dies during Vulkan swapchain creation. There is no error window and no
crash dialog. The game process just disappears. Hydra shows nothing useful.

The crash is a **NULL function pointer call inside Wine's `winevulkan.so`**:

```
warn:seh:handle_syscall_fault backtrace: --- Exception 0xc0000005 at 0x7f52ae82f980:
  .../GE-Proton11-10-x86_64/files/lib/wine/x86_64-unix/winevulkan.so + 0x2b980.
err:vulkan:vkGetPhysicalDeviceQueueFamilyProperties Exception 0xc0000005 in Unix call.
```

Under UMU-Proton-10.0-4 the faulting address is `winevulkan.so + 0x40120`, which
`nm` resolves to `thunk64_vkGetPhysicalDeviceQueueFamilyProperties`. The fault is an
execute fault (instruction pointer equals the fault address, `rax = 0`), so the
thunk calls through a NULL pointer in the physical device's dispatch table.

## Environment

- Machine: `north-cachy`, CachyOS, kernel 7.2.10-1-cachyos, booted 2026-10-29 12:06.
- GPU: AMD RX 9070 (Navi 48, RADV `GFX1201`), Mesa/vulkan-radeon 26.2.4-1
  (installed 2026-10-03; no relevant package updates since 2026-10-20).
- Compositor: Hyprland 0.56.2 (Wayland). XWayland is running on `:0`.
- Displays: DP-1 3440x1440@240 (LG, HDR capable) and DP-2 3440x1440@144.
- Proton builds installed under `~/.local/share/Steam/compatibilitytools.d/`:
  GE-Proton11-9/10/11, UMU-Proton-10.0-4, several proton-cachyos-slr builds;
  plus `/usr/share/steam/compatibilitytools.d/proton-cachyos-slr`.
- Launcher: Hydra Plus 4.1.6-plus.17, `/opt/Hydra Plus/resources/umu-run`
  (umu-launcher 1.4.4, steamrt3 runtime "sniper").
- Game folder: `~/Games/Enshrouded-AnkerGames/Enshrouded/`
  (RUNE crack: `winmm.dll` loader, `steamclient64.dll`, `steam_emu.ini`;
  Hydra also installed OptiScaler as `dxgi.dll` on 2026-10-29 01:07).
- Prefix: `~/.config/hydra-plus/wine-prefixes/1203620`.
- Launch command Hydra builds (GE-Proton variant):

  ```
  PROTON_LOG=1 GAMEID=umu-1203620 WINEPREFIX=<prefix> PROTONPATH=<GE-Proton11-10-x86_64>
  MANGOHUD=1 WINEDLLOVERRIDES='dxgi=n,b;lsteamclient=d;winmm=n,b'
  PROTON_ENABLE_WAYLAND=1 PROTON_ENABLE_HDR=1 DXVK_HDR=1
  gamemoderun /usr/bin/python3 '/opt/Hydra Plus/resources/umu-run' <game>/enshrouded.exe
  ```

## History

1. **2026-10-28 ~00:55** Game installed from AnkerGames. First launch shows a big
   window with only an error icon. Game log:
   `Failed to load module 'C:\Program Files (x86)\Steam\steamclient64.dll'`,
   `FATAL ERROR: Online_InitializationFailed`.
2. **~01:00** Added `winmm=n,b` so the RUNE loader runs. Still failed, now at
   `ConnectToGlobalUser`.
3. **~01:06** User found GE-Proton 11 works where Proton-CachyOS does not. Cause:
   Proton's Wine swaps its `lsteamclient` bridge in for any `steamclient64.dll` a
   game loads; the crack ships its own, so the bridge hijacks it. GE-Proton turns the
   bridge off for umu launches, Proton-CachyOS does not. Confirmed by adding
   `lsteamclient=d` to Proton-CachyOS. Shipped as commit `89cb0ba07`
   (`fix(launch): turn off Proton's Steam bridge ...`) so every Proton build behaves
   the same. **This part is solved and still in effect.**
4. **01:07:24** The one launch that got past swapchain creation: the game ran for
   about 29 s and shut down cleanly (`backup/enshrouded_2026-10-29T01-07-24.log`).
   See "The one good run" below.
5. **01:34 onward** Every launch crashes at swapchain creation, from Hydra and from
   a shell script alike. A first harness run saw "exit code 3 after ~2 s" and wrote
   it off as a harness artefact. It is this crash.
6. **2026-10-29 12:46-12:48** Three Hydra launches (cachyos-slr, GE-Proton11-10,
   UMU-Proton-10.0-4) all crash the same way.
7. **~13:00-13:10** Debugging session (this file). DP-2 had been disconnected since
   about 01:26; the user turned it back on and the crash persisted.

## How to recognise the crash

The game's own log (`<game>/enshrouded.log`, rotated into `<game>/backup/` on the next
launch) ends abruptly after:

```
[graphics] Supported vulkan device formats:
...
[graphics] desiredImageCount for swap chain: 3 (min:3 max:16)
```

A healthy run continues with `Vulkan swap chain created size:3440x1440 ...` about 16 ms
later, then `Initialize 'SwapChain' done`.

## The one good run

`backup/enshrouded_2026-10-29T01-07-24.log` (the only successful one, Hydra launch,
GE-Proton11-10, env without `lsteamclient=d` because the Hydra fix wasn't built yet):

- Two monitors found (`DISPLAY1`, `DISPLAY2`), both `HDR enabled: false`.
- The surface exposed **only two formats** (`B8G8R8A8_srgb`, `B8G8R8A8_unorm`), the
  shape you get from XWayland, not from Wine's Wayland driver.
- Swapchain created, game ran, user closed it.

The launch 23 seconds later (`01-07-47`) had the same command line, the same two
monitors, but exposed 18 surface formats (the Wayland driver with HDR10 formats) and
crashed. So the same command line produced both an X11-style and a Wayland-style
surface within a minute. What decided that is unknown.

Today an X11-style run (`PROTON_ENABLE_WAYLAND` unset, 2 surface formats) **also
crashes**, so X11 vs Wayland is not sufficient on its own.

## What has been ruled out

All of these were tested today by launching from a shell script that reproduces
Hydra's command (without `gamemoderun`/`MANGOHUD` unless noted), and checking whether
`swap chain created` appears in `enshrouded.log`. Every one of them crashed:

| Variation                                                         | Result                                                            |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| Hydra's exact env, GE-Proton11-10                                 | crash (18 surface formats)                                        |
| Same without `PROTON_ENABLE_HDR`/`DXVK_HDR`                       | crash (18 formats)                                                |
| Same without `PROTON_ENABLE_WAYLAND` (X11 path)                   | crash (2 formats)                                                 |
| `dxgi=n,b` removed (OptiScaler still loads, see Cause)            | crash, both X11 and Wayland                                       |
| Fresh scratch prefix instead of the Hydra prefix                  | crash (X11, 2 formats)                                            |
| `DISABLE_LSFGVK=1` (LSFG-VK frame-gen layer off), X11 and Wayland | crash                                                             |
| UMU-Proton-10.0-4                                                 | crash, `winevulkan.so + 0x40120`                                  |
| Proton-CachyOS (slr), from Hydra at 12:47                         | no swapchain in the game log (log size matches the crashing runs) |
| DP-1 already in HDR at launch (Hydra, 12:47, `HDR enabled: true`) | no swapchain in the game log                                      |
| DP-2 reconnected                                                  | crash                                                             |

Other notes:

- The prefix was repeatedly "upgraded" between Proton builds during today's cycling
  (`Prefix has an invalid version?!` in the umu log). The fresh-prefix test says this
  isn't the cause.
- No package changes between the good run and now that touch Mesa, Wine, Proton,
  Hyprland or XWayland. The machine **was rebooted** at 12:06, but crashes also
  happened before the reboot (01:34, 01:54).

## Not yet tried

(As of 13:10. The first two items were then run and led to the Cause above.)

- `VK_LOADER_LAYERS_DISABLE='~implicit~'` and `VK_LOADER_DEBUG=layer,error`. This is the
  obvious next step: implicit layers present are `VK_LAYER_LSFGVK_frame_generation`
  (no enable variable, always on unless `DISABLE_LSFGVK=1`; tested off), MangoHud,
  `VK_LAYER_MESA_anti_lag`, `VK_LAYER_MESA_device_select`, Steam overlay/fossilize,
  AFMF and MAKO (those two need an enable variable). `DISABLE_LSFGVK=1` may not have
  crossed the pressure-vessel container boundary, so "layers ruled out" is not proven.
- A run with `WINEDEBUG=+vulkan` to see which instance/device the game passes into
  `vkGetPhysicalDeviceQueueFamilyProperties` (a stale or wrong-ICD `VkPhysicalDevice`
  would explain a NULL entry in the dispatch table).
- Another Vulkan game under the same Proton, to see whether this is Enshrouded-specific.
  Sekiro (`/mnt/Storage/Games/Sekiro`) was launched by another session and the game
  reached its window, so Vulkan under Proton in general may be fine. Not compared
  properly (Sekiro is D3D12 via vkd3d-proton, Enshrouded is native Vulkan).
- `vulkaninfo` inside and outside the umu container, to compare the device list.
- Whether the 9070 XT is enumerated twice (iGPU "Granite Ridge" is also present).
  The game log picks "Vulkan device 0 (AMD Radeon RX 9070 XT)" and also logs
  "Unknown vulkan device feature struct" warnings (harmless last night).
- `~/.local/share/vulkan/implicit_layer.d/` was edited 2026-10-18 (afmf-linux) and
  2026-10-13 (MAKO); check whether either predates the good run, and whether anything
  else in `~/.local/lib` is injected (`LD_PRELOAD`, `VK_ADD_LAYER_PATH`,
  `VK_INSTANCE_LAYERS`).

## Useful files and commands

- Hydra's per-launch log: `~/.config/hydra-plus/logs/umu-1203620.log` and
  `~/.config/hydra-plus/logs/umu.log` (each launch prints its full command).
- Hydra main log: `~/.config/hydra-plus/logs/info.txt`, search for `Launching game with umu-run`.
- Game logs: `<game>/enshrouded.log` and `<game>/backup/enshrouded_<timestamp>.log`.
- **Proton log:** `PROTON_LOG=1` writes `~/steam-1203620.log`. It is **over 4 GB** because
  of stack-unwind trace spam. Do not open or grep it blindly. Filter with
  `grep -a -v -E "unwind|dwarf"`, or run with `WINEDEBUG='err+all,warn+seh'` instead of
  `PROTON_LOG`, which produces an 11 KB log that still contains the crash.
- Minimal repro script used today (not committed): launches umu-run with the Hydra
  environment, waits up to 30 s for `swap chain created` in `enshrouded.log`, then kills
  the game by PID. Kill with `pgrep -f "[e]nshrouded.exe"`, never a bare `pkill -f`.
- Resolving the faulting offset:
  `nm <proton>/files/lib/wine/x86_64-unix/winevulkan.so | sort` and find the symbol at or
  below the offset.
- Related repo docs: `docs/features/launch-rules.md`, `docs/features/online-fix.md`,
  `docs/features/optiscaler.md`, `docs/renodx-hdr-plan.md`.
- Related machine docs: `~/system-docs/05-gotchas.md` #25 and #28 (HDR).

## Side effects of today's testing

- About ten shell-launched Enshrouded runs against the Hydra prefix and a scratch prefix
  at `/tmp/claude-1000/-home-moonlight-Development-hydra/f33d45ee-f61b-4925-b7c3-9e33ec773b8d/scratchpad/pfx`.
- Those runs deleted `<game>/enshrouded.log` each time. No game files were changed.
- Hydra's cloud-save sync was not involved in the shell launches.
