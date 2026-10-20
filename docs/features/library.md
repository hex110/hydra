# Library

The library page sorts and filters games by more than upstream's library
does: where a game comes from, how far you are with it, and catalogue data
such as genres, scores and length.

## Tabs

`All / Local / Steam / Epic / Classics` replace upstream's
`All / PC / Classics` buttons and its Hydra / Steam / Epic dropdown.

| Tab      | Shows                                                                        |
| -------- | ---------------------------------------------------------------------------- |
| All      | Everything.                                                                  |
| Local    | PC games Hydra installed or found: downloads, scanned folders, custom games. |
| Steam    | Games imported from the Steam library linked to your profile.                |
| Epic     | Games imported from the linked Epic library.                                 |
| Classics | Emulated games (LaunchBox).                                                  |

A game with both a Hydra copy and a Steam import is listed under both Local
and Steam. The Steam and Epic tabs only appear while the library has such
games. The console filter shows on All and Classics.

The old category and source settings carry over once: a single selected
source becomes its tab (Hydra → Local), Classics stays Classics, anything else
becomes All.

## Play status

Each game can be marked **Playing**, **Backlog**, **Finished** or
**Dropped**, from the right-click menu (**Play status**), the selection bar,
the details pane, or the **Your game** card on the game page. The status shows as a badge on library cards
(a coloured dot on narrow cards), and is hidden together with the playtime
badge by **Hide the playtime badge on library cards**.

Starting a game marked **Backlog** moves it to **Playing**. Nothing else
changes a status on its own.

The status is stored on this machine only; Hydra's servers have no field for
it. For a game with copies from several stores, it is set on every copy.

## Header

The header stays put while the grid scrolls (it used to collapse on the first
scroll and swallow it). It holds the tabs, **Collections**, **Filters** and a
labelled **Installed** toggle (before, an unlabelled check-circle icon), then:

- **Group by**: nothing, play status, genre, source or installed. Each group
  has a header with a count; click it to fold the group. A game with several
  genres or sources shows in each of them. Folded groups are remembered.
- **Sort by**.
- **Card size**: one slider from small covers to the wide cards, replacing
  the three unlabelled view buttons (the old choice maps onto it).
- **Details pane**, **Surprise me** and **Statistics** (below).

## Cards

- Playtime shows only from a minute of play (or a playtime you set by hand);
  the "Ready" badge on installed games is gone.
- Covers of games that aren't installed are dimmed, as on Steam, and light up
  on hover.
- Hovering an installed game shows a **Play** button over the cover; it
  starts the game without opening its page (**Close** while it runs).
- Classics show their emulator as an icon instead of a text badge.

## Selecting games

Ctrl-click (Cmd on macOS) adds a card to the selection, Shift-click selects a
range. A bar at the bottom then acts on all of them at once: set the play
status, add to a collection, add to favourites, add to or remove from the
wishlist, remove the files of installed copies, or remove them from the
library (both ask first). **Esc** or the bar's **×** clears the selection.

## Keyboard

Click the grid (or Tab into it), then:

| Key               | Does                                                     |
| ----------------- | -------------------------------------------------------- |
| Arrows, Home, End | Move between cards.                                      |
| Shift + arrows    | Extend the selection.                                    |
| Typing            | Jumps to the next title starting with what you typed.    |
| Enter             | Opens the game page.                                     |
| Ctrl + Enter      | Plays an installed PC game.                              |
| Space             | Adds the focused card to the selection, or takes it out. |
| Ctrl + A          | Selects every game shown.                                |
| Esc               | Clears the selection.                                    |

## Details pane

The **Details pane** button opens a panel next to the grid, as in Playnite.
With it open, a click selects a game and shows it there; a double-click opens
the game page. The pane has the artwork, **Play** (or **Download**), a link to
the game page, play status, playtime, last played, achievements, How Long to
Beat's main story, installed size, genres and [notes](#notes).

## Surprise me

Picks a random installed game among the ones the current tab and filters
show (from the whole library when none of them is installed) and opens it,
or selects it in the details pane when that is open. The home page's
**Surprise me** still picks from the store.

## Notes

A free text field per game, in the details pane and on the game page's
**Your game** card, saved as you type. Notes are stored with the game record
on this machine; for a game with several copies they are written to each.

## Statistics

The chart button opens your library in numbers: games, installed, played,
total playtime, how many are in each play status, the completion rate
(finished out of played), playtime per genre, the most played games and
playtime per month for the last year. Playtime counts Hydra, Steam and Epic
time; the monthly chart comes from the play activity the home page records,
so it starts in 4.1.6-plus.11.

## Filters

The **Filters** button holds:

| Filter           | Values                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Play status      | The four statuses, plus **No status**.                                                                     |
| Genre            | Every genre in the library (your own genres, see [Game page](game-page.md#details), win over the store's). |
| ProtonDB         | Platinum, Gold, Silver, Bronze, Borked. Linux only.                                                        |
| How Long to Beat | Main story length: under 2 h, 2–6 h, 6–15 h, 15–30 h, 30–60 h, over 60 h.                                  |
| Metacritic score | 90 and up, 80–89, 70–79, under 70.                                                                         |
| Installed size   | Under 10 GB, 10–50 GB, 50–100 GB, over 100 GB.                                                             |
| Never played     | No playtime from Hydra, Steam or Epic.                                                                     |
| Hide duplicates  | See below.                                                                                                 |

Values within a filter are alternatives (RPG _or_ Action); different filters
all have to match. A game without the value (no Metacritic score, not
installed) is left out while that filter is set. The button shows how many
values are selected, and **Clear filters** resets all but **Hide
duplicates**. Filters are remembered between sessions.

Clicking a genre on a game page opens the library filtered to that genre.

The sidebar's game list follows the library's tab, filters and **Installed**
toggle, as Steam's left list does, and keeps its own sort. Its filter menu
changes the same settings as the library page.

### Saved filters

**Save as collection** at the bottom of the Filters menu keeps the current
tab, filters, **Installed** toggle and console filter under a name, like
Steam's dynamic collections ("Installed RPGs under 15 h"). It shows in the
**Collections** dropdown and fills itself from the library every time it is
opened. Saved filters are kept on this machine only.

### Hide duplicates

Upstream already merges copies of a game that the catalogue links (a Steam
and an Epic copy of the same title). **Hide duplicates** also folds entries
that only share a title, such as a scanned folder added as a custom game next
to the Steam game. One entry per title stays: the Steam copy if there is
one, otherwise the one with more playtime. Titles are compared ignoring case,
accents, punctuation and ™/®.

## Sorting

Added to upstream's options:

| Sort             | Order                      |
| ---------------- | -------------------------- |
| Recently added   | Newest first.              |
| Release date     | Newest first.              |
| Metacritic score | Highest first.             |
| Shortest to beat | Shortest main story first. |
| Installed size   | Largest first.             |

Games without the value go last, in title order.

## Catalogue data

Genres, release dates, Metacritic scores, ProtonDB tiers and How Long to Beat
times come from Hydra's API (the same endpoints the game page uses, plus the
batched Steam store details for Metacritic). Hydra fetches them in the
background 30 seconds after it starts and whenever games are added, three
games at a time, and keeps them in the local database (`gameLibraryMetadata`)
for a week. Data that only partly arrived is fetched again a day later. When
the API can't be reached at all, Hydra waits half an hour before trying again.

Custom games have no catalogue data; give them genres yourself.

## Download state on cards

A card shows what is happening to the game across its bottom edge:
**Downloading** and **Extracting** with live progress, **Paused** and
**Queued** with the progress reached, and **Setting up** while
[game setup](game-setup.md) runs. For a game with copies from several stores,
the card follows whichever copy is busy.

## Collections

Collections no longer need a Hydra account. Signed out, they are kept on this
machine (`localCollections` in the database) and can be renamed and deleted
from their right-click menu. When you sign in, they move to your account: an
account collection with the same name is reused, otherwise one is created,
and the games follow. Saved filters stay local.

**Add or remove games** in a collection's right-click menu (and in the
**Collections** dropdown while a collection is selected) lists the whole
library with a search box. Tick the games that belong in the collection and
save; only the games you changed are updated.

## Wishlist

Mark a game you want but can't download yet with **Add to wishlist**: on the
game page of a game you don't have (it is added to the library as well), in
the game page's **⋯** menu, the right-click menu or the selection bar. The
**Wishlist** entry in the **Collections** dropdown lists them.

When a download source adds downloads for a wishlisted game that isn't
installed, Hydra shows a notification that opens the game (or the wishlist,
for several). It uses upstream's check for new download options, which runs
only while you are signed in. **When a download source adds a game on my
wishlist** under Settings → Notifications turns it off.
