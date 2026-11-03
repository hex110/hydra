# Catalogue

The catalogue plays the part of Steam's store. Hydra Plus adds three tabs,
a grid view, more data per game and a list that keeps your place.

## Tabs

| Tab          | What it is                                                |
| ------------ | --------------------------------------------------------- |
| **Discover** | Shelves of games to look at ([below](#discover)).         |
| **Charts**   | Lists of what is played and what is good (not built yet). |
| **Browse**   | The whole catalogue with filters, search and sort.        |

The strip is the shared `TabStrip` (the library's source tabs use it too) and
stays visible while the page scrolls. **Hide my games** sits at its right end
and applies to every tab. Discover and Charts remember how far you had
scrolled; Browse keeps its own position with its results.

A search, a tag or any filter other than the sort order switches to Browse,
wherever it comes from: the header search, a tag on a game page, **See all**
on a shelf. Choosing **Classics** does too. Clearing filters leaves the tab
alone.

## One card, one row, one shelf

Every store game in the catalogue is the same thing wherever it appears
(`components/`):

- `StoreGameCard`: Steam's wide header image (460×215), with the library
  badge top-left, the ProtonDB tier bottom-right (Linux only), and under it
  the title, the reason it is shown (when there is one) and the facts line.
  The whole card opens the game; the buttons sit above that.
- `StoreGameRow`: the same content beside a smaller cover, for the list view.
- `StoreShelf`: a row of cards with a title, an optional **See all**, and
  buttons to page through it. It shows whole cards only: 2 under 900 px of
  shelf width, 3 under 1300, 4 under 1700, otherwise 5, measured on the shelf
  itself, not the window. The vertical wheel keeps scrolling the page.

**Facts line**, reserved at a fixed height so cards don't move when the facts
arrive: up to three Steam tags, then chips for the **review score** (Steam's
share of positive reviews, blue at 70 % and up, tan 40–69, orange under 40;
none under 10 reviews, as on Steam; the tooltip says "Very Positive · 62,210
reviews"), the release year, How Long to Beat's main story, the typical
download size, and Metacritic. A chip with no value is left out. AnkerGames
cards add their version as a chip.

**Buttons**, on hover and on keyboard focus: download (when the game can be
downloaded), wishlist star, and **+**. A wishlisted star and the added check
stay visible, dimmed. Resting the pointer on a card cycles through
screenshots (see below).

Skeletons use the dark token colours, not the skeleton library's light theme.

## Discover

The first tab shows:

- **Featured**: Hydra's "Hot now" list.
- **New on AnkerGames** and **Trending on AnkerGames**: the site's latest
  additions and its trending games ([details](ankergames.md#catalogue-rows)).
- **Recommended for you**: the home page's
  [suggestions](home.md#suggested-for-you), each with the game it came from.
- **Discovery queue**: one game at a time from the rows above and the new
  releases, as a compact card with its facts and **Open**, **Add to
  library** and **Next**. Games added leave the queue.
- **New releases on your sources**: the newest games released up to this
  year. Sorting the whole catalogue by date shows mostly games nobody has
  uploaded, so this row only takes games your download sources have.
- **Browse by tag**: a chip for each of Steam's 30 most popular tags
  (Indie, Action, Atmospheric, …), which sets the tag filter. Features such as
  Singleplayer, 2D and Early Access are left out; they are filters, not
  something to browse.

With **Hide my games** on, games already in your library are left out of
every row except the two AnkerGames ones, which show the site's rows whole
(the discovery queue never offers a game you own). The rows are kept for half
an hour while Hydra runs (the AnkerGames rows come from a daily read
instead). **New releases on your sources** has **See all**, which opens
Browse sorted by newest with your sources selected.

## Tag filter

The **Tags** filter lists Steam's tags with the most popular first (Steam's
own ranking), then the rest alphabetically; the search box still finds any of
them. The catalogue lists a few very common tags, such as Roguelike and
Roguelite, with no games, so Hydra checks the 45 most popular ones once a day
and hides those that return nothing. Clicking a tag on a game's page opens the
catalogue filtered to it. The cards are links, so their tags are not clickable.

## Library state

Rows show **In library** or **Installed** next to the title for games you
have (a copy counts for the catalogue game it is linked to), and the + button
turns into a check. **Hide my games** in the tab strip leaves them out. The
search API can't exclude games, so a page with many owned games shows fewer
rows.

The star next to + adds a game you don't have to your wishlist (the same
wishlist as the game page's star, with its download alerts) and removes it
again. Wishlisted games carry **Wishlisted** instead; until 2026-11-01 they
were wrongly marked **In library**, because a wishlist entry is a library
record. **Hide my games** keeps them.

## Rows and grid

The toolbar above the results (sticky under the tabs) holds the result
count, **Modern Games / Classics**, the sort (Popularity, Highest rating,
Most reviewed, Newest, Oldest, Title A–Z and Z–A) and **List / Grid**, which
switch between rows and a grid of cards
([one card, one row](#one-card-one-row-one-shelf)); the choice is remembered.
Classics keep their own layout.

Once a game is on screen, Hydra fills in:

- Steam's **review score** and **release year** (the search result's year
  when it has one), from the same Steam request as the tags;
- the **Metacritic** score, coloured as on Metacritic (75 and up green, 50–74
  yellow, under 50 red);
- How Long to Beat's **main story** time;
- the **download size**: the median size of the downloads your sources have,
  since the smallest upload is often a patch or a fix.
- the game's top three **Steam tags**, in your language, in place of its
  genres (Epic and Classics rows keep their genres). They come from Steam in
  one request per page of rows and are kept for six hours.

Resting the pointer on a cover cycles through up to five screenshots after a
short pause. Steam's trailers only come as DASH/HLS streams, which a plain
video element can't play, so previews use screenshots.

The data comes from Hydra's API: the batched Steam store details (score and
screenshots, one request per ten games), the How Long to Beat endpoint and the
download-sources list per game. The main process keeps it for an hour.

A card or row for a game that can be downloaded shows a **Download**
button next to **+** on hover. It opens the game page with its download
options, which go straight to the download settings when there is one
option. Whether a game can be downloaded comes from its sources and, for
AnkerGames and local sources, from their indexes alone: checking a page of
results never fetches AnkerGames game pages.

## Load more

Numbered pages are replaced by **Load more**, which appends the next 30
games, with "Showing 60 of 209,946" above it. The loaded list, the filters
and the scroll position are kept while Hydra runs, so going back from a game
page lands where you were. A different search starts from the top.
