# Game page and interface

## Options

The game page's **Options** button and the **Options** entry in the
right-click menu of the library and sidebar open the same dialog. (Upstream
calls the menu entry "Properties".)

## More menu

The **…** button next to Options holds what used to take the most prominent
spot beside Play, and links to the game elsewhere:

- **Add to favorites** / **Remove from favorites**, and **Pin game** /
  **Unpin game** (signed in, store games only);
- **Open on Steam**, **SteamDB**, **ProtonDB** and **PCGamingWiki** for games
  with a Steam app id, and **PCGamingWiki** search otherwise;
- **Open on HowLongToBeat** (a search for the title).

Games not in the library show the links only.

## Play status and genres

The **Play status** button next to **Options** sets the game's
[play status](library.md#play-status). The sidebar lists the game's genres;
clicking one opens the library filtered to that genre.

## Details

**Options → Details** replaces what the store shows for the game:

- **Description**: plain text shown under "About this game" instead of the
  store description. Line breaks are kept.
- **Genres**: a comma-separated list used on the game page and by the
  library's genre filter instead of the store's genres.
- **Store details language**: the language the game page asks the store for
  (description, requirements, …), for games whose store page is better in
  another language. **Same as Hydra** follows the app language. Steam and
  Epic fall back to English for languages they don't have.

**Use store details** clears the description and genres. The title and
images are edited as before, under **General** and **Customization**.

## Artwork

The artwork picker under **Customization** shows the stores' own cover,
hero, logo and icon first, labelled Steam, Epic Games or LaunchBox, from
every store the catalogue links the game to, followed by SteamGridDB's
results. Store artwork needs no account, so the picker now opens while
signed out too; SteamGridDB still needs a Hydra sign-in.

## Missing files

Hydra checks every game's executable shortly after it starts, and when a
launch finds it gone. A game whose executable is missing is marked:

| Status            | Meaning                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| Files missing     | The drive is there but the executable is not (moved or deleted).           |
| Drive not mounted | The executable sits on a drive or share that is not mounted at the moment. |

The sidebar shows a warning icon next to the game, and the game page shows the
status in place of **Play**. Clicking it checks again (for a drive that has
been mounted since); if the files are still missing, it opens the game's
**Locations** options to pick the executable. Picking an executable clears
the status. Upstream's scan still clears executables that are gone for good.

## Middle-click autoscroll

Chromium has no middle-click autoscroll on Linux, so Hydra adds it: press the
middle mouse button over a scrollable area (not on a link or button) and move
the mouse. A quick click keeps scrolling until the next click, Escape or the
mouse wheel; holding the button scrolls until it is released.

## Fixes

Behaviour that differs from upstream because of a fix (several found in other
forks, see the [fork survey](../fork-survey.md)):

- Changing or resetting a game's playtime updates the library and sidebar
  right away, not only the game page.
- When a catalogue search fails, the catalogue says so instead of showing
  loading placeholders forever. Failing tag, genre, publisher and developer
  lists only leave those filters empty.
- An achievement the catalogue has no entry for still notifies, under its
  raw name with the game's icon. Upstream dropped it silently.
- More than ten new achievements from one file (a Steam cache or imported
  save seen for the first time) show one combined notification instead of a
  popup each.
- Videos pause while the window is minimised or hidden and resume after,
  instead of fast-forwarding to catch up.
- When Hydra's API doesn't answer at startup, the window opens after at most
  8 seconds with the cached profile. Upstream waited for the connection to
  time out, which took 134 seconds when measured (2026-10-19); without any
  network it already opened at once.
