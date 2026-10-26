# Floppy sync

[Floppy](https://github.com/dannyvfilms/floppy) is a self-hosted game tracker
(a Yamtrack fork). Hydra Plus keeps it in step with your library. It is
optional and needs no Hydra account.

## Settings

**Settings → Integrations → Play tracking → Floppy** is a card like the other
integrations. Enter the Floppy URL and an API token and press **Connect**,
which checks them before saving. Once connected the card shows the server, when
Hydra last synced, and why the last sync failed if it did. **Sync** pulls from
Floppy now; **Disconnect** forgets the token (the URL stays, so reconnecting
only needs a new token) and can also remove the games Floppy added to the
library. Nothing is deleted in Floppy.

The options sit in three sections: **Library** (adding Floppy-only games),
**Start and end dates** (filling them from Steam history) and **Send your whole
library** (the one-off library sync below).

Sync goes both ways, with a fixed owner for each field:

| Field       | Owner          | Notes                                                                                  |
| ----------- | -------------- | -------------------------------------------------------------------------------------- |
| Play status | Floppy         | Hydra's change is pushed; a pull then applies Floppy's.                                |
| Rating      | Floppy         | Set on the game page, **Your rating** (1–10); Floppy's score.                          |
| Wishlist    | Both, add-only | See below.                                                                             |
| Playtime    | Hydra          | Pushed as minutes (Hydra plus [Steam](steam-history.md)); never lowers Floppy's value. |

## What is pushed

| Hydra                                               | Floppy                                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Playtime                                            | Progress, in whole minutes. Only ever raised, so playtime entered in Floppy is never lowered. |
| Play status: playing / finished / dropped / backlog | In progress / Completed / Dropped / Planning                                                  |
| Your rating (1–10)                                  | Score                                                                                         |
| Wishlisted game                                     | On the **Wishlist** list (created on demand)                                                  |

### Status rules

- Changing the play status in Hydra always sets that status in Floppy.
- A playtime or wishlist sync never overwrites a status that already exists
  in Floppy. The one exception: an entry still on Planning moves to In
  progress once the game has playtime.
- A game with no playtime, status or rating is not created in Floppy.
- Removing a game from Hydra never deletes anything in Floppy.
- Wishlisted games go on a list, not on Planning, because Planning also means
  "owned, waiting to be played".

## Matching

Floppy identifies games by IGDB id. Hydra searches Floppy's IGDB provider by
title and accepts only a result whose normalised title (case, punctuation and
™/® ignored) equals the game's, preferring the PC release. The id is stored on
the game record as `floppyMediaId`. A game with no exact match is skipped for
the rest of the session rather than guessed.

## Pulling from Floppy

Hydra pulls from Floppy a minute after it starts, every 30 minutes, and on
**Sync** in the settings. It reads Floppy's whole game list (a handful of
requests) and, for each game in your library:

- matches it by the stored id, or else by an exact title that appears once in
  your Floppy list, so no search is needed;
- takes Floppy's status (Planning → Backlog, In progress → Playing,
  Completed → Finished, Dropped → Dropped; **Paused** has no Hydra status and
  changes nothing) and score;
- puts the game on Hydra's wishlist if it is on Floppy's Wishlist list.

A game with a change still waiting to be pushed (about ten seconds) is
skipped, so a fresh edit in Hydra is not overwritten.

Adding a game to the library, linking a match or adding a custom game also
pulls, so the game gets its status and rating straight away. These pulls skip
the Floppy-only import, and requests made while a pull is running share one
follow-up pull, so adding several games in a row never runs overlapping pulls. Taking a game off
Floppy's Wishlist list does not remove it from Hydra's wishlist: a game
wishlisted before this existed is not on the list yet.

## Adding Floppy games to the library

With **Add Floppy games played outside Steam to the library** on, each pull
also adds the games Floppy tracks that you don't own on Steam as ordinary
uninstalled library entries (Steam artwork, your status and rating from
Floppy). Hydra searches its catalogue by title and accepts only a single exact
match; on a match it also links an existing library entry for the same game.

- Entries Floppy itself imported from Steam, and games your Steam library
  lists, are left to the [Steam import](steam-history.md) and its playtime
  limit.
- A game you removed from the library, or unlinked from Floppy, is never added
  again.
- They stay off your Hydra profile until you download or launch one; then it
  is an ordinary game of yours.
- Titles differing only by Roman numeral (II = 2), a leading "The" or an edition
  word (Remastered, Game of the Year Edition, ...) still match, but only when
  exactly one catalogue game fits; "I", "V" and "X" are never read as numerals.
- Games with no match (Valorant, Minecraft: not on Steam) are listed in the
  **Library** section after a **Sync**. **Add as custom game** puts one in the
  library as an uninstalled custom entry with Floppy's cover, linked to its
  Floppy entry.
- Turning the option off, or disconnecting, offers to remove the games it
  added. Only untouched entries go (see
  [Removing imported games](steam-history.md#removing-imported-games)).

## Fixing a match

In a game's options, **Details → Floppy** shows which Floppy entry the game is
tracked as. **Search** looks the title up in Floppy (IGDB) and **Use this**
links the game to the entry you pick; it is pushed and pulled straight away.
**Don't track this game in Floppy** unlinks it for good: neither the title
match nor the library import will link it again, until you pick an entry.

## Sending your whole library

Changes are sent as they happen, so this is for games played before Floppy was
connected. **Preview** reports what would be created and updated without
writing; **Send library** applies it. It runs in the background (four games at
a time), so you can leave the settings page; coming back shows its progress or
last result. The result lists every game that was (or would be) changed, with
its old and new status and playtime, and the games that could not be matched.
If every game fails, Floppy itself is the problem and the task fails with the
reason instead of reporting hundreds of failed games.

## Code

`src/main/services/floppy/`: `floppy-sync-core.ts` is the pure planning and
matching logic (tested), `floppy-client.ts` the API client, `floppy-sync.ts`
the debounced queue and library backfill. Sync is triggered from
`set-game-play-status`, `set-game-wishlisted` and `onCloseGame` in
`process-watcher`.

## TODO

- A "played anywhere" library view of every game tracked in Floppy.

## Why there is no per-session history

Floppy records every extra play of a game as another entry of that game (a
"repeat"), each with its own status and progress. Sending one entry per day
played would make Floppy count dozens of replays and split the playtime across
rows, so Hydra sends totals, plus the start and end dates described in
[Steam history](steam-history.md#floppy). The
sessions view in Floppy is only a different way to display those entries.
