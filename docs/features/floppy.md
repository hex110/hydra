# Floppy sync

Hydra Plus can push your play data to a [Floppy](https://github.com/dannyvfilms/floppy)
tracker (a self-hosted Yamtrack fork). Settings live in
**Settings → Integrations → Floppy**: turn it on, enter the Floppy URL and an
API token, and use **Test connection**, which also saves the settings.

Sync is **one way, Hydra → Floppy**. Nothing is read back into Hydra.

## What is pushed

| Hydra                                               | Floppy                                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Playtime                                            | Progress, in whole minutes. Only ever raised, so playtime entered in Floppy is never lowered. |
| Play status: playing / finished / dropped / backlog | In progress / Completed / Dropped / Planning                                                  |
| Wishlisted game                                     | Planning, when the game is not tracked yet                                                    |

A game is pushed ten seconds after its session ends or its status or wishlist
flag changes (changes are debounced per game). Failures are logged and retried
on the next change; there is no persistent queue.

### Status rules

- Changing the play status in Hydra always sets that status in Floppy.
- A playtime or wishlist sync never overwrites a status that already exists
  in Floppy. The one exception: an entry still on Planning moves to In
  progress once the game has playtime.
- A game with no playtime, status or wishlist flag is not created in Floppy.
- Removing a game from the wishlist, or from Hydra, never deletes anything in
  Floppy.

## Matching

Floppy identifies games by IGDB id. Hydra searches Floppy's IGDB provider by
title and accepts only a result whose normalised title (case, punctuation and
™/® ignored) equals the game's, preferring the PC release. The id is stored on
the game record as `floppyMediaId`. A game with no exact match is skipped for
the rest of the session rather than guessed.

## Library sync

**Preview library sync** reports what would be created and updated without
writing; **Sync library now** applies it. Both report the games that could not
be matched.

## Code

`src/main/services/floppy/`: `floppy-sync-core.ts` is the pure planning and
matching logic (tested), `floppy-client.ts` the API client, `floppy-sync.ts`
the debounced queue and library backfill. Sync is triggered from
`set-game-play-status`, `set-game-wishlisted` and `onCloseGame` in
`process-watcher`.

## TODO

- **Rating.** Hydra has no per-game rating yet. Once it does, push it as
  Floppy's `score` (a `PATCH /media/game/igdb/{id}/` field).
- A way to correct a wrong or missing match from the game's options.
- Optionally read Floppy's status and score back into Hydra.
