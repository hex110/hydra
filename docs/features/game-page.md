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
