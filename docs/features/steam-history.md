# Steam history

Hydra Plus can read your playtime, last played times and achievement unlock
dates straight from Steam. It uses your own Steam Web API key, so it needs no
Hydra account and does not go through Hydra's servers (unlike the upstream
Steam sync, which is separate and untouched). Settings live in
**Settings → Integrations → Steam history**: enter your SteamID64 and a key
from `steamcommunity.com/dev/apikey`, press **Test connection**, then
**Import now**. Your Steam profile's **Game details** must be public.

The key is stored in Hydra's user preferences next to the other tokens.

## What is imported

For every game you own (including ones that are not in Hydra's library):

- total playtime, with the Linux and Steam Deck shares;
- the last time you played it;
- for games with achievements, every achievement with its name, description
  and the exact time you unlocked it. Only games played at least once are
  read, and a game is read again only when its playtime or last played time
  changed, so later imports are fast.

The first import reads about 400 games' achievements and takes a few minutes;
later ones take seconds. Hydra then repeats it 90 seconds after starting and
every six hours.

## Where it shows

- **Game page**, in the game's block: an **On Steam** section with playtime,
  last played and `unlocked / total` achievements. **When you unlocked them**
  lists each one, newest first.
- **Library games from Steam**: Steam's playtime is added to Hydra's, and the
  last played time is updated if Steam's is later. The stored amount is
  Steam's total minus what Hydra tracked itself, so the displayed total is the
  larger of the two and a game launched through Steam from Hydra is not
  counted twice. (Hydra's own tracking can still add to it afterwards.)
- **Home page heatmap and streaks**: see below.

## Day-by-day activity

Steam keeps no per-day history. It only reports totals and the last played
time. So Hydra compares each import with the previous one: play added since
then is recorded in the activity heatmap on **the last day you played that
game**, minus any play Hydra already recorded itself. This means:

- the first import records no activity (there is nothing to compare with);
- from then on the heatmap fills in for Steam games, accurately when you
  import often (the schedule does) and approximately when you played the same
  game on several days between two imports.

Achievement unlock dates are real, but they are not turned into activity:
they carry no duration.

## Floppy

When Floppy sync is on, a game's start and end date are filled in from this
data, only when they are empty in Floppy and never overwritten:

- **Start date**: the day of the first achievement unlocked (approximate: the
  first unlock can come well after the first launch);
- **End date**: the last day played, and only for games marked Completed.

Hydra also pushes the displayed playtime (Hydra plus Steam), not just its own.

## Code

`src/main/services/steam-history/`: `steam-history-core.ts` is the tested
logic, `steam-history-api.ts` the Steam client, `steam-history-sync.ts` the
background job and schedule. Entries are stored per app id in the
`steamHistory` sublevel.

## Not done

- Games you played on Steam but that are not in Hydra's library only exist in
  the Steam history store; a library view of them is planned (see the
  roadmap).
- Steam wishlist (no official API; the public profile page is the only source).
