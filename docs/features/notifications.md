# Notifications

Hydra tells you about things in two places: a **desktop pop-up** (through the
system's notification server) and an entry in the **Notifications** page (the
inbox, the bell in the sidebar). Both lead to the same place when clicked.

## How it is built

Every notification goes through `notify()` in
`src/main/services/notifications/notify.ts`. A publisher in
`notifications/index.ts` only describes the notification: type, text, image,
the settings switch that silences it, and a **target**, which says where a
click leads. `notify()` then:

1. writes the inbox entry (unless the type is `null`: pop-up only),
2. reads the switch, and if it is on, shows the pop-up,
3. on a click, marks the entry read and opens the target.

Pop-ups shown outside `notify()` (chat, mods, screenshots) still use
`showDesktopNotification()`, which keeps the click handler alive (see below).

Targets (`NotificationTarget` in `@types`, paths in
`src/shared/notification-targets.ts`) are typed, not URL strings:

| Target               | Opens                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `game` (+ `section`) | The game page, with a game options section open (`?options=`)                              |
| `games`              | One game: its page. Several: their inbox entry, which lists them, each linking to its page |
| `achievements`       | The game's achievements page                                                               |
| `profile`            | A user's profile                                                                           |
| `downloads`          | Downloads                                                                                  |
| `library-scan`       | The library with the scan results                                                          |
| `path`               | A route given as text, for routes the server sends (leaderboards)                          |

`section` is one of `NOTIFICATION_GAME_SECTIONS`, the same list the game page
accepts from `?options=`, so a notification can't name a section the page
ignores. In Big Picture a click opens the matching Big Picture page when there
is one, and otherwise only brings the window forward.

The inbox entry stores the target; `url` is derived from it and kept for
entries written before targets existed. The inbox keeps the newest
`LOCAL_NOTIFICATION_LIMIT` (200) entries.

## The notifications

| Notification                          | Inbox          | Switch                 | Click opens                          |
| ------------------------------------- | -------------- | ---------------------- | ------------------------------------ |
| Download complete                     | yes            | Downloads              | Game page                            |
| Extraction complete                   | yes            | Downloads              | Game page                            |
| Download halted (disk full)           | yes            | Downloads              | Downloads                            |
| Hydra update ready                    | yes            | always                 | Restarts and installs                |
| Game updates found                    | yes            | Game updates           | Downloads                            |
| Game updated / update failed          | yes            | Game updates           | Game page / Downloads                |
| New download for a wishlisted game    | yes            | Wishlist               | Game, or the entry listing the games |
| Steam wishlist release / release date | yes            | Wishlist               | Game, or the entry listing the games |
| Saves found                           | yes            | Saves found            | Game options → Import saves          |
| OptiScaler files missing              | yes            | Game tools             | Game options → OptiScaler            |
| Tool check failed                     | yes            | Game tools             | Game options → Tools                 |
| Library scan results                  | yes, no pop-up | —                      | Library with the scan results        |
| Repack list updated                   | no             | Repacks                | Catalogue                            |
| Friend request                        | server inbox   | Friend requests        | Notifications                        |
| Friend started playing                | no             | Friend started playing | Friend's profile                     |
| Chat message                          | no             | Chat                   | The chat                             |
| Leaderboard                           | server inbox   | Leaderboards           | The board                            |
| Achievement unlocked                  | no             | Achievements           | Game's achievements                  |
| Mods (nxm links)                      | no             | always                 | The game's mods page                 |
| Screenshot uploads                    | no             | always                 | Your profile                         |

The switches live in **Settings → Notifications** (and Big Picture's settings);
their defaults are `NOTIFICATION_PREFERENCE_DEFAULTS`, shared by both settings
pages and the main process. They only silence the pop-up: the inbox keeps
everything. Downloads defaults to on, unlike upstream, because extraction,
which always popped up before, now shares that switch.

## Clicks on Linux

- **Click handlers.** A notification whose JS object is garbage collected
  loses its click handler. `notify.ts` keeps the latest 50 referenced, and
  releases one when it closes or is clicked. A cap rather than "close" alone,
  because servers that keep a history never report a close.
- **Bringing the window forward.** On Wayland a window can't take focus by
  itself: Hyprland ignores the request unless `misc:focus_on_activate` is on,
  and Electron can't pass on the notification server's activation token.
  `bringWindowToFront()` (`src/main/services/window-focus.ts`) asks normally,
  and on Hyprland, if the window still isn't focused 150 ms later, runs
  `hyprctl dispatch focuswindow pid:<pid>`, then the Lua form
  `hyprctl eval 'hl.dispatch(hl.dsp.focus({ window = "pid:<pid>" }))'` for Lua
  configs. Other compositors get the normal request only.
- **Window closed to the tray.** The main window is created with the target as
  its first page, and a window still loading is reloaded on the target route
  (`WindowManager.focusMainWindowAndNavigate`).
- **A section that isn't there.** A link to a game options section the game
  doesn't have (OptiScaler removed, game not installed) opens Tools or General
  instead of an empty pane.

## Adding a notification

1. Add a publisher in `notifications/index.ts` that calls `notify()`; for an
   inbox entry, add its type to `LocalNotificationType` and an icon in
   `local-notification-item.tsx`.
2. Give it a target. If it opens a new game options section, add the section
   to `NotificationGameSection` and `NOTIFICATION_GAME_SECTIONS`.
3. Pick a switch. A new one goes in `NotificationPreferenceKey`, the defaults,
   `UserPreferences`, and both settings pages.
4. Add a row to the table above.

## Checking it

`npm test -- src/shared/notification-targets.test.ts` covers the target paths
and switch defaults. By hand: trigger a notification (a Steam wishlist check, a
game update check), click the pop-up with Hydra unfocused, minimised and closed
to the tray, and check that it comes forward on the right page and the inbox
entry turns read.
