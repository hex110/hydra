# Home page

The home page starts with your own games; the catalogue (Hot now, Top games
of the week, Games to beat, Surprise me) follows below them.

## Last played

The hero shows the game you played last, with when you played it, your total
playtime and a **Play** button (**Close** while it runs). Clicking anywhere
else opens its game page. Games marked **Finished** or **Dropped** (see
[play status](library.md#play-status)) are skipped. With nothing played yet,
upstream's featured game is shown instead.

## Play activity

A panel under the hero shows:

- **Streak**: days in a row with at least a minute of play. It counts up to
  today, or up to yesterday while today has no play yet ("Play today to keep
  it going"), next to the longest streak in the last 13 weeks.
- **Played this week**: total play since Monday.
- **Most played this month**, with its time.
- A **13-week heatmap**, a column per week (Monday on top). Darker squares
  mean more play: under 30 minutes, 30–60 minutes, 1–2 hours, more. Hovering
  a square shows the date and time played.

Play is recorded per day from the playtime Hydra tracks (the same ticks that
add to a game's playtime, and an emulator session's time when it ends). It is
stored locally (`playActivity` in the database, one entry per day with the
time per game) and was not recorded before 4.1.6-plus.11, so the heatmap
starts empty. Time Steam or Epic count for games Hydra doesn't track is not
included.

## Continue playing

The next most recently played games after the hero, newest first, without
finished or dropped games. They are ordinary library cards: right-click for
the game menu.

## Clear your backlog

Installed games waiting to be played, up to twelve:

1. games marked **Backlog**,
2. then games never started,
3. then games not played for two months, longest untouched first.

Within each group, shorter games ([How Long to Beat](library.md#catalogue-data)
main story) come first. Games with another play status, and games already in
Continue playing, are left out.

## Suggested for you

Games similar to the ones you played most, that aren't in your library. Hydra
takes up to five games, weighting play in the last 30 days three times over
total playtime and adding ten hours for games marked **Finished** (dropped
games don't count), and asks Hydra's catalogue for games similar to each
(the list the game page shows under "Similar games"). A game similar to
several of them, or near the top of a more played one's list, ranks higher,
and no single game supplies more than its share of the row. Each card says
which game it came from. Only Steam catalogue games are used, since the
similar-games list exists for those. Results are kept until Hydra restarts.

### Other sources

Checked 2026-10-20, so the question doesn't need researching again:

- **Backloggd** has no API or data export, and its pages sit behind a
  proof-of-work bot check (Anubis), so they can't be read without working
  around it.
- **IGDB** (which Backloggd uses) has `similar_games`, but needs a Twitch
  client id and secret per app. A secret can't ship in an open-source app;
  it would have to be the user's own.
- **RAWG**'s suggested-games endpoint is limited to its business plans.
