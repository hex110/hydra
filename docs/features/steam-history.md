# Steam history

Hydra Plus can read your playtime, last played times and achievement unlock
dates straight from Steam. It uses your own Steam Web API key, so it needs no
Hydra account and does not go through Hydra's servers. It replaces upstream
Hydra's Steam integration, which needed a Hydra account and is removed in
Hydra Plus (see [the roadmap](../roadmap.md#hydra-without-an-account)). Your Steam profile's **Game
details** must be public.

## Settings

**Settings → Integrations → Play tracking → Steam history** is a card like
the other integrations. Enter your SteamID64 and a key from
`steamcommunity.com/dev/apikey` and press **Connect**, which checks them
against Steam before saving. Once connected the card shows the SteamID, when
the last import finished, its progress while it runs, and why the last import
failed if it did. **Import now** runs an import; **Disconnect** forgets the key
and can also remove the games the import and the wishlist added to the
library. Playtime and achievements already imported stay.

The options sit in two sections, **Library** and **Wishlist**, described
below. The key is stored in Hydra's user preferences next to the other tokens.

## What is imported

For every game you own (including ones that are not in Hydra's library):

- total playtime, with the Linux and Steam Deck shares;
- the last time you played it;
- for games with achievements, every achievement with its name, description
  and the exact time you unlocked it. Only games played at least once are
  read, and a game is read again only when its playtime or last played time
  changed, so later imports are fast.

The first import reads the achievements of every game you have played, which
takes a few minutes for a large library; later ones take seconds. Hydra then
repeats it 90 seconds after starting and every six hours. When Steam
rate-limits or briefly fails (HTTP 429, 502, 503), a request is retried up to
three times with a growing delay, honouring Steam's `Retry-After`.

## Adding your Steam games to the library

Turn on **Add my Steam games to the library** (in the **Library** section) and
the import creates an ordinary, uninstalled library entry for each
owned game that has none, with Steam's artwork, so it needs no catalogue
request. Choose the minimum playtime: **no playtime** adds every owned game
(your whole library), or only games played at least 1 minute, 30 minutes or an
hour. Demos and betas are always skipped.

- They sit under the **Steam** tab and respond to the same filters, sorting,
  collections and statuses as any library game. They are not "recently
  added".
- A game that is already in the library, **including one you removed**, is
  left alone: your choice wins.
- They stay off your Hydra profile until you download or launch one. From then
  on it is an ordinary game of yours: uploaded like any other, no longer
  under the Steam tab, and never removed by the options below.
- Installing one works like any uninstalled game.
- A game below the playtime limit that you later add from the catalogue gets
  its Steam history, Floppy status and rating straight away.

## Steam wishlist

In the **Wishlist** section, turn on **Follow my Steam wishlist** and Hydra reads your wishlist through
Steam's Web API (the same key; the profile's game details must be public)
every three hours and when you press **Check wishlist now**.

- **Release notifications.** When a game that was "coming soon" is out, you get
  a notification (and an entry in the notification list) that opens the game's
  page, where the usual download options appear. A game going into Early
  Access says so. The first check only records the wishlist, so nothing that
  is already out is announced.
- **Release dates (optional).** _Also tell me when an unreleased game gets a
  release date_ adds a notification when a game that had no date now has one.
- **Upcoming games in the library.** On by default: games that are not out yet
  are listed as ordinary library entries and marked wishlisted, so they show
  in the wishlist collection and Hydra's own download alerts apply. Games you
  removed stay removed, and they stay off your Hydra profile until you
  download one. Floppy's **Wishlist** list gets them too when Floppy sync is on.
- Games you already own, or that are already out, are not added; they are only
  tracked to notice their release. Games bought or taken off the wishlist stop
  being tracked.

The status shows as a task on the Downloads page, and the **Wishlist** section
shows when it last checked or why the check failed.

## Removing imported games

Turning off **Add my Steam games to the library**, **List wishlisted games that
are not out yet in the library** or Floppy's **Add Floppy games played outside
Steam to the library** asks whether to remove the games that option added;
**Disconnect** offers the same as a checkbox. Only untouched entries go: a game
you downloaded, launched, played in Hydra, favourited, pinned, put in a
collection, wrote notes for or gave custom artwork stays. Playtime, status and
rating that came from Steam or Floppy don't count as touching it.

The entries are deleted outright rather than marked removed, so turning the
option on again adds them back. A game you removed yourself stays removed.

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

## Previewing and limits

**Preview what would be added** (next to the playtime limit) asks Steam for
your owned games and reports how many would be added at that limit, without
writing anything. The limit defaults to 30 minutes of playtime.

Steam's playtime and Hydra's overlap for a game Hydra starts through Steam, so
by default the longer of the two is shown. A game's options (**Details**) have
**Add Steam's playtime to Hydra's** for games you play both ways.

## Floppy

When Floppy sync is on, a game's start and end date are filled in from this
data, only when they are empty in Floppy and never overwritten:

- **Start date**: the day of the first achievement unlocked (approximate: the
  first unlock can come well after the first launch);
- **End date**: the last day played, and only for games marked Completed.

**Fill in Floppy start and end dates from Steam history** in the Floppy
settings turns the dates off. Hydra also pushes the displayed playtime (Hydra plus Steam), not just its own.

## Upstream's Steam integration

Upstream Hydra's Steam integration (Steam sign-in, a sync through Hydra's
servers into your Hydra profile) is removed. Steam history covers what it did
locally, and the two wrote a game's Steam playtime differently.

- Games it imported stay in the library and under the Steam tab.
- A game's Steam playtime now only comes from Steam history. A profile merge
  no longer overwrites it with the profile's Steam share (which is 0 for anyone
  who never connected upstream's integration).
- Hydra counts its own playtime for every game it sees running, including
  games started from a Steam library folder; Steam history then shows the
  larger of the two (see [Where it shows](#where-it-shows)).
- The copy of your Steam data on Hydra's servers can only be deleted by
  disconnecting in upstream Hydra, or in Hydra Plus 4.1.6-plus.13 or earlier.

## Code

`src/main/services/steam-history/`: `steam-history-core.ts` is the tested
logic, `steam-history-api.ts` the Steam client, `steam-history-sync.ts` the
background job and schedule. Entries are stored per app id in the
`steamHistory` sublevel.

Removal is in `src/main/services/imported-games.ts`; what counts as untouched
is `isUntouchedImport` in `src/shared/imported-games.ts` (tested).
