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
**Dropped**, from the right-click menu (**Play status**) or the button next to
**Options** on the game page. The status shows as a badge on library cards
(a coloured dot on narrow cards), and is hidden together with the playtime
badge by **Hide the playtime badge on library cards**.

Starting a game marked **Backlog** moves it to **Playing**. Nothing else
changes a status on its own.

The status is stored on this machine only; Hydra's servers have no field for
it. For a game with copies from several stores, it is set on every copy.

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

**Add or remove games** in a collection's right-click menu (and in the
**Collections** dropdown while a collection is selected) lists the whole
library with a search box. Tick the games that belong in the collection and
save; only the games you changed are updated. Collections still need a Hydra
account, as upstream.
