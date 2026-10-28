# Catalogue

The catalogue plays the part of Steam's store. Hydra Plus adds a front page,
a grid view, more data per game and a list that keeps your place.

## Front page

With no search, no filters and the default sort, the catalogue opens with:

- **Featured**: Hydra's "Hot now" list.
- **New on AnkerGames** and **Trending on AnkerGames**: the site's latest
  additions and its weekly download chart ([details](ankergames.md#catalogue-rows)).
- **Recommended for you**: the home page's
  [suggestions](home.md#suggested-for-you), each with the game it came from.
- **Discovery queue**: one game at a time from the two rows above and the
  new releases, with **Open**, **Add to library** and **Next**. Games added
  leave the queue.
- **New releases on your sources**: the newest games released up to this
  year. Sorting the whole catalogue by date shows mostly games nobody has
  uploaded, so this row only takes games your download sources have.
- **Browse by genre**: a chip per Steam genre, which sets the genre filter.

Games already in your library are left out of every row. The rows are kept
for half an hour while Hydra runs (the AnkerGames rows come from a daily
read instead). Searching, filtering or changing the sort
hides the front page; the full list follows it under **All games**.

## Library state

Rows show **In library** or **Installed** next to the title for games you
have (a copy counts for the catalogue game it is linked to), and the + button
turns into a check. **Hide my games** in the header leaves them out. The
search API can't exclude games, so a page with many owned games shows fewer
rows.

## Rows and grid

**List** and **Grid** in the header switch between upstream's rows and a grid
of larger covers; the choice is remembered. Classics keep their own layout.

Once a row is on screen, Hydra fills in:

- the **Metacritic** score, coloured as on Metacritic (75 and up green, 50–74
  yellow, under 50 red);
- How Long to Beat's **main story** time;
- the **download size**: the median size of the downloads your sources have,
  since the smallest upload is often a patch or a fix.

Resting the pointer on a cover cycles through up to five screenshots after a
short pause. Steam's trailers only come as DASH/HLS streams, which a plain
video element can't play, so previews use screenshots.

The data comes from Hydra's API: the batched Steam store details (score and
screenshots, one request per ten rows), the How Long to Beat endpoint and the
download-sources list per game. The main process keeps it for an hour.

## Load more

Numbered pages are replaced by **Load more**, which appends the next 30
games, with "Showing 60 of 209,946" above it. The loaded list, the filters
and the scroll position are kept while Hydra runs, so going back from a game
page lands where you were. A different search starts from the top.
