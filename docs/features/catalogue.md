# Catalogue

The catalogue plays the part of Steam's store. Hydra Plus adds three tabs,
a grid view, more data per game and a list that keeps your place.

## Tabs

| Tab          | What it is                                                   |
| ------------ | ------------------------------------------------------------ |
| **Discover** | Shelves of games to look at ([below](#discover)).            |
| **Charts**   | Lists of what is played and what is good ([below](#charts)). |
| **Browse**   | The whole catalogue with filters, search and sort.           |

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

The first tab is grouped by purpose, each group with a small heading and every
shelf loading on its own, so one slow source never holds up the page.

**For you.** The top suggestion large (a hero panel), then **Recommended for
you**, then **Because you played X** for your two leading games (Steam's "More
like this" list for the game, re-ranked by the same score). The first two have
**See all**, which opens [For you](#for-you-and-tune); the Because shelf opens
it based on that one game. With no games in the library the group is replaced
by a short explanation and a link to the library.

**Popular now.** **Most played today** and **Trending** from the
[charts](#charts) (**See all** opens that chart), then **Featured**, Hydra's
"Hot now" list.

**New.** **New releases on your sources**: the newest games released up to
this year. Sorting the whole catalogue by date shows mostly games nobody has
uploaded, so this row only takes games your download sources have; **See all**
opens Browse sorted by newest with your sources selected. Then **New on
AnkerGames** and **Trending on AnkerGames**: the site's latest additions and
its trending games ([details](ankergames.md#catalogue-rows)).

**Explore.** The **discovery queue** (one game at a time from your suggestions
after the shelf, then the trending chart, new releases and Featured, as a
compact panel with its facts and **Open**, **Add to library**, **Not
interested** and **Next**; added games leave the queue). **Hidden gems**:
suggestions rated 90 % and up with 50 to 5,000 reviews, niche first.
**Finished and polished**: suggestions rated 85 % and up that are not Early
Access, were released over a year ago and whose public build has not changed
for a year ([how Hydra knows](#finished-games)). Each has a **See all** that
opens For you with those filters set. Last, **Browse by tag**: a chip for each
of Steam's 30 most popular tags, which sets the tag filter. Features such as
Singleplayer, 2D and Early Access are left out; they are filters, not
something to browse.

With **Hide my games** on, games already in your library are left out of every
shelf except the two AnkerGames ones, which show the site's rows whole. Every
other shelf also leaves out games marked **Not interested** and games with an
[avoided tag](#avoid-tags). The Hydra-sourced rows are kept for half an hour
while Hydra runs (the AnkerGames rows come from a daily read instead).

## For you and Tune

**For you** is Discover's suggestions as a page: results on the left, as the
same list or grid as Browse, 60 at a time with **Load more**, and the **Tune**
panel on the right. Changes re-rank at once (a dragged slider asks once, 300 ms
after it stops) and show the last results dimmed with "Updating…" until the new
ones are in. Games you own never appear.

### How it chooses

Hydra learns what you like from the whole library, signed out and without a
Steam key, in four steps (`src/shared/recommender/`, run in the main process by
`recommender.ts`):

1. **A weight per game.** Playtime as `log2(1 + hours)` (**All time** counts
   play in the last 90 days up to twice; **Last 90 days** counts only that),
   times your rating (9–10 ×1.6, 7–8 ×1.25, 5–6 ×0.8, 3–4 ignored, 1–2
   ×−0.5), a Finished game ×1.25 and at least ten hours' worth, a Dropped game
   counted against, and Backlog or wishlisted games with no play as a small
   intent. No single game supplies more than a fifth of the whole (with five
   games or more). Copies of one game count once, by the larger playtime.
2. **A taste vector**: each game's first fifteen tags, vote-weighted, summed by
   those weights. Tags that only name the format (Singleplayer, 2D, Early
   Access, Free to Play, Controller, Great Soundtrack) are left out.
3. **Candidates** (about 800): Steam's "More like this" for your eight leading
   games, a Hydra search for each of your six leading tags (best rated and
   most popular), and the last year's top releases. Your games, games marked
   Not interested and demos, prologues and soundtracks are removed.
4. **A score** per candidate: 0.6 tag similarity to your taste (a tag many
   candidates share counts for less), 0.25 its place in Steam's lists for your
   games, 0.15 review quality (the lower bound of the 95 % confidence
   interval, so 100 % from 12 reviews ranks below 95 % from 20,000). The
   Tune sliders then nudge the order without changing what counts as similar.
   Hard filters apply, then the list is picked one game at a time for score
   and for being unlike what is already picked, with at most three per played
   game (and two per developer) in the first dozen, more as the list grows.

Each result says why: "Because you played Hades" (the game that contributed
most), with the two tags it shares with your taste and Steam's review verdict
on hover.

### Idle games

An idle or clicker game runs in the background, so its hours are not
attention, and any recommender built on playtime would suggest idle games to
whoever's most played game is one. So by default (**Treat idle games as
background play**, on) a game with an Idler, Incremental or Clicker tag among
its first five has its playtime counted at 10 %, does not seed the search for
candidates, and idle games are not suggested at all. Turning it off treats them
like any other game. Leaning toward an idle tag also lets them through.

### Tune

| Section                | What it does                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Based on**           | All time, Last 90 days, or Picked games (search your library). Your leading games show as chips with their share; the ✕ leaves one out, and a note says which idle game is discounted.                                                                                                                                            |
| **Avoid tags**         | See [below](#avoid-tags). Open by default.                                                                                                                                                                                                                                                                                        |
| **Leans toward**       | Tags a result must have among its first 3, 5 or 10 tags: a game that is somewhat like that tag without it being the main one. A tag also stands for its related tags, and counts double in your taste (even if your library has none of it).                                                                                      |
| **Order**              | Niche ↔ Popular and Older ↔ Newer. These move games up and down; they never remove any.                                                                                                                                                                                                                                         |
| **Filters**            | Minimum review score (applied from 50 reviews) and minimum reviews, release years, length (How Long to Beat's main story, from the top 150 results), ProtonDB minimum (Linux), **Finished games only**, Singleplayer only, Hide Early Access, **Downloadable only**. Filters that need a lookup say how many games were left out. |
| **Presets**            | Save the current settings under a name, switch, delete. **Reset** returns to the defaults and keeps your avoid list.                                                                                                                                                                                                              |
| **Not interested (n)** | The games you hid, each with **Restore**.                                                                                                                                                                                                                                                                                         |

The settings, presets and Not interested list are kept in Hydra's database
(`catalogueTaste`, `catalogueNotInterested`).

### Avoid tags

A result is dropped when an avoided tag is among its first 5, 10 or 20 tags
(**A tag counts when it is among a game's**). **Also avoid related tags**, on
by default, adds the tags that mean nearly the same: Idler, Incremental and
Clicker; the multiplayer tags; the roguelike tags; Horror, Psychological Horror
and Survival Horror. Games with an avoided tag in their first five are also
left out of what your taste is learned from, so an avoided Clicker Heroes does
not leak Casual and 2D into the profile either. When one family holds over
30 % of your profile, Tune offers it: "Your profile leans on Idler (Clicker
Heroes, 3,200 h). Avoid it?"

The list is one list: For you, Discover's shelves, the discovery queue and the
Charts filter all use it.

### Not interested

The **✕** on a card (hover) hides a game from For you, every Discover shelf
except the AnkerGames ones, and the queue; a bar offers **Undo** for a few
seconds. Browse and Charts still list it.

### Finished games

**Finished games only** needs to know when a game's public build last changed;
Steam's own API does not say, so Hydra asks steamcmd.net (a request a second,
kept a week) for the games at the top of the list, as many as it takes to
find 24. A game it cannot find a date for is left out and counted, never
treated as finished. A game's DLC releases are not counted. The first time
the shelf loads this can take half a minute.

## Charts

One table and a right-hand column with the chart picker and the chart's
filters. The table shows rank, cover and title (with the library badge),
tags, the chart's own numbers, Steam's review share (toned, the count in its
tooltip), the release year and, on Linux, ProtonDB's tier. Clicking a heading
sorts by it (larger first, then reversed, then back to the chart's order; **#**
restores it). On a narrow table the tags and year columns drop out. A row opens
the game's page, also for a Steam game the catalogue doesn't know. Hovering a
row shows the + / wishlist / Download buttons.

| Chart                         | Source and what it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Playing now**               | Steam's top 100 by players in game now (kept 15 minutes), with the day's peak.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Most played today**         | Steam's top 100 by the day's peak (kept an hour), with places gained or lost since last week, or **New**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Trending**                  | From the same list: games that gained five places or more, or are new, by places gained.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Most played singleplayer**  | Candidates from SteamSpy's Singleplayer tag (top 500 by yesterday's peak) plus both Steam charts, kept when Steam lists the game as single-player ([rule](#singleplayer-rule)). Players now where the live chart has the game, otherwise SteamSpy's number from yesterday's peak. SteamSpy's playtime data no longer works, so there is no playtime column.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Most played, 30 / 90 days** | From [steamcharts.com](https://steamcharts.com) (no API, so Hydra reads its pages, one a second, politely). **30 days** ranks the top 200 games by players now by **player-hours** over the last 30 days: real playtime, which SteamSpy no longer has. **90 days** ranks the 50 games with the most player-hours by average players over roughly 90 days: the last 30 days and the two full months before them, each game from its own page (a first load takes about a minute; kept a day). A game missing from a month counts as no players there. Background and idle apps rank high on hours, so **Avoid tags** matters here. If steamcharts.com can't be reached the chart says so and falls back to Hydra's own record of Steam's daily top 100 (taken once a day while it runs, 120 days kept), ranked by the sum of `101 − rank`, with a "Collecting since…" notice until it has 7 (30 days) or 30 (90 days) recorded days. |
| **Top releases**              | Steam's monthly lists, with a month picker. Steam's newest page may lag the calendar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Best rated**                | Hydra's highest rated Steam games (`hydraScore`, 100 games) with Steam's facts; a minimum review count (default 1,000) drops tiny games with a perfect score.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Software and other non-games drop out of every chart. **Hide my games** and
the filters apply to the loaded list, which is honest here: a chart is at most
a few hundred games, all of them loaded.

Filters: **Tags** (a game must carry all of them), **Avoid tags** (hides a game
with one of them among its first five tags; **Also avoid related tags**, on by
default, adds the tags that mean nearly the same: Idler, Incremental and
Clicker; the multiplayer tags; the roguelike tags), **Minimum ProtonDB tier**
(Linux; games with no reports are left out while it is on), **Singleplayer
only**, **Hide Early Access** and **Free to play: Any / Only / Hide**. They are
remembered, except the avoid list, which is the [shared one](#avoid-tags).

A source that fails says so on the chart, naming the service ("Steam's charts
could not be reached", "SteamSpy could not be reached"), with **Try again**;
the SteamSpy chart still shows the games from Steam's own charts then.

### Singleplayer rule

A game counts when Steam lists it as a game (not DLC or software) with the
single-player category and without MMO, and the Singleplayer tag is among its
tags ahead of every multiplayer tag. Rainbow Six Siege and Helldivers 2 carry
the tag low in their lists and are left out; Baldur's Gate 3 lists it above
Co-op and stays in.

### Data

Steam's store pages (`IStoreBrowseService/GetItems`: reviews, release, tags,
player categories, developers, header image, 50 ids per request) are kept for
seven days in memory and in the database. SteamSpy asks for about a request a
second and its Singleplayer list is 17 MB, so Hydra keeps only the top 500
games by players, for a day. ProtonDB tiers are fetched per game, six at a
time, after the rows show, and kept for a day.

## Filters

The right-hand column of Browse is built from the shared `SidebarSection`.
Sections start folded, except **Tags** and any section with a selection. The
**active filters** row above the results keeps one colour per kind of filter
(tokens in `globals.scss`).

**Counts.** Next to each tag and genre, in grey, is how many games the
catalogue has with it ("Games in the catalogue with this tag or genre" says the
tooltip). The search API returns no facet counts, so a main-process job
(`catalogue-facet-counts.ts`) asks once per value (`take: 5`, four at a time,
about 500 requests), at most once a day, the first time the catalogue opens.
It keeps the result in the database (`catalogueFacetCounts`) and tells the page
when it is done; a value whose request failed keeps yesterday's count and is
asked for again the next time. The counts are for the whole catalogue, not for
the current filters: live counts would take a request per value on every
change. A value with no games is hidden unless selected, which replaces the
old check of the 45 most popular tags.

**Order.** In Genres and Tags: selected values first, then **From your
library** (Tags only: the eight tags that weigh most in your taste, with idle
games discounted as for [suggestions](#how-it-chooses)), then every value by
count, highest first. Until the counts are in, Tags use Steam's popularity
order. The filter box shows above ten items. Clicking a tag on a game's page
opens the catalogue filtered to it. **Genres** leaves out software and media
categories (Utilities, Video Production, Education, Documentary, …;
`NON_GAME_STEAM_GENRES`).

**Developers and Publishers** are search fields instead of lists of
thousands: nothing is listed until you type (the first 50 matches), except
**From your library**, the five developers (or publishers) of your most played
games that the filter knows. Chosen names show as chips. Counts are not shown
for them.

**ProtonDB** (Linux) has an explicit **Any** first, then Silver and up, Gold
and up, Platinum only.

**Narrow windows.** Below 1100 px the column becomes a **Filters (n)** button in
the toolbar that opens it as a drawer over the results (Esc or **Close
filters** shuts it).

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
