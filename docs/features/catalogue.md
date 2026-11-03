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
shelf loading on its own, so one slow source never holds up the page. Every
shelf shows what it had last time first (see [Cache first](#cache-first)).

**For you.** A **Recommended for you** section that leads into the
recommender: how many games it learned from and in how many
[taste groups](#how-it-chooses), each group as a chip that opens For you on it,
and **Open recommendations**. Under it the top pick of all groups mixed, as a
large panel, then one shelf per taste group for the three largest, each titled
with the group's name ("Difficult / Platformer / Metroidvania") and **See all**
opening For you on that group. Discover always shows the groups mixed,
whatever For you is set to. With nothing in the library the group is replaced
by a short explanation and a link to the library.

**Popular now.** **Most played today** and **Trending** from the
[charts](#charts) (**See all** opens that chart), then **Featured**, Hydra's
"Hot now" list.

**New.** **New releases on your sources**: the newest games released up to
this year. Sorting the whole catalogue by date shows mostly games nobody has
uploaded, so this row only takes games your download sources have; **See all**
opens Browse sorted by newest with your sources selected. Then **Most
anticipated** (Steam's most followed upcoming games, **See all** opens that
chart), **New on AnkerGames** and **Trending on AnkerGames**: the site's
latest additions and its trending games
([details](ankergames.md#catalogue-rows)).

**Explore.** **Hidden gems**: suggestions rated 90 % and up with 50 to 5,000
reviews, niche first. **Finished and polished**: suggestions rated 85 % and up
that are not Early Access, were released over a year ago and whose public
build has not changed for a year ([how Hydra knows](#finished-games)).
**Outside your usual**: the best games of the catalogue's most common tags
that none of your groups is about (four of the 20 most common tags), so the
suggestions don't narrow to what you already play. Each has a **See all** that
opens For you with those settings. Then the **discovery queue** (one game at a
time from your suggestions, the trending chart, new releases and Featured,
with **Open**, **Add to library**, **Not interested** and **Next**; added
games leave the queue) and **Browse by tag**: a chip for each of Steam's 30
most popular tags with its count, which sets the tag filter. Features such as
Singleplayer, 2D and Early Access are left out; they are filters, not
something to browse.

With **Hide my games** on, games already in your library are left out of every
shelf except the two AnkerGames ones, which show the site's rows whole. Every
other shelf also leaves out games marked **Not interested** or
[played elsewhere](#feedback-from-cards) and games with an
[avoided tag](#avoid-tags).

## For you and Tune

**For you** is the recommender as a page: results on the left, as the same
list or grid as Browse, 60 at a time with **Load more**, and the **Tune**
panel on the right. The heading names what it shows ("For you · Difficult /
Platformer / Metroidvania", "7 groups mixed", "like 1 game"). Changes re-rank
at once (a dragged slider asks once, 300 ms after it stops) and show the last
results dimmed with "Updating…" until the new ones are in. Games you own or
played elsewhere never appear.

### How it chooses

Hydra learns what you like from the whole library, signed out and without a
Steam key (`src/shared/recommender/`, run in the main process by
`recommender.ts`). Nodal (nodal.gg) was the owner's reference: groups of games
and tags, not "because you played X".

1. **A weight per game.** Playtime as `log2(1 + hours)` (**Groups** counts
   play in the last 90 days up to twice; **Recent** counts only that), times
   your rating (9–10 ×1.6, 7–8 ×1.25, 5–6 ×0.8, 3–4 ignored, 1–2 ×−0.5), a
   Finished game ×1.25 and at least ten hours' worth, a Dropped game counted
   against, and Backlog or wishlisted games with no play as a small intent.
   No single game supplies more than a fifth of the whole (with five games or
   more). Copies of one game count once, by the larger playtime. Games with an
   avoided tag among their first five are left out. Every game played, rated
   or wishlisted counts (up to 1,500); games Steam has no tags for can't, and
   Based on says how many.
2. **Tag rarity from the catalogue.** A tag few games carry (Flight) counts
   for more than one most games carry (Action): `log(1 + catalogue size /
(1 + games with the tag))`, from the daily [counts](#filters). Before the
   first count, rarity within your library stands in.
3. **Taste groups.** Each game's first fifteen tags, vote-weighted and scaled
   by rarity, are grouped by weighted spherical k-means into
   `round(√(games / 12))` groups (460 games make six, at most eight), started from your
   heaviest game and then each time from the game least like the groups so
   far, so the same library gives the same groups. A group with under 4 % of
   the weight joins its nearest group; dropped and low-rated games join the
   group they are most like and pull its taste away from themselves. Each
   group is named by its three tags with the most **lift** (common in the
   group, rare in the catalogue, near the top of at least a quarter of its
   games, not two of one family). Those three are its **anchors**. Format tags
   (Singleplayer, 2D, Early Access, Free to Play, Controller, Great
   Soundtrack) take no part.
4. **Candidates per group**: Steam's "More like this" for its three heaviest
   games, Hydra's search for each anchor (best rated and most popular),
   Steam's store search for its first two anchors with your avoid list left
   out, and the most reviewed games of the last year. Kept six hours, also
   across a restart.
5. **The anchor rule.** A candidate must carry one of the group's anchors (or
   a tag of its family) among its first five tags, and gets a small bonus the
   rarer the anchor and the higher up it is. This is what keeps a game that
   leads with Flight from being matched by shooters that share Military and
   War. In **Games** mode the anchors are each chosen game's rarest leading
   tag: Ace Combat 8 gives Ace Combat 7, Project Wingman, DCS World and VTOL
   VR, not Call of Duty or Squad.
6. **A score**: 0.55 tag similarity to the group, 0.25 the candidate's place in
   Steam's lists for the group's games, 0.2 the [Hydra rating](#hydra-rating),
   then the anchor bonus and the Tune sliders, which move games without
   changing what counts as similar. Hard filters apply, then each group's list
   is picked one game at a time for score and for being unlike what is already
   picked, with at most three per game of yours (and two per developer) in the
   first dozen, more as the list grows.
7. **Mix all** interleaves the groups' lists by their share (smooth weighted
   round robin), so a group with a third of the weight gives about a third of
   the results, without repeats.

Two things keep the list fresh. Games whose scores are within 2 % of each
other change places once a week (Spotify's weekly mix): stable for a week, new
the next. And a suggestion shown four times or more without being opened sinks
a little each time, down to 70 % (Netflix); opening its page forgets the count
(`catalogueImpressions`).

Each result names the two tags it shares with your taste; the tooltip names
the group it fits and Steam's verdict. On a group's own shelf the title already
says it.

### Idle games

An idle or clicker game runs in the background, so its hours are not
attention, and any recommender built on playtime suggests idle games to
whoever's most played game is one. Idler, Incremental and Clicker start in the
[avoid list](#avoid-tags): games with them are left out of your taste and out
of the suggestions. Remove them from the list to treat idle games like any
other. Settings saved before 2026-11-03 had an "idle games" switch instead;
with it on (the default), the idle tags are added to the avoid list once.

### Tune

| Section                | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Based on**           | **Groups** (all time), **Last 90 days**, **Games** or **Tags**. In the first two: **Mix all groups**, then each group with its games, hours and share; **Details** lists every game in it with its hours, share of the group and notes (rated high, finished, dropped, played outside Hydra), each with ✕ to leave it out. Games played elsewhere are listed under them. **Games** searches your library and the whole catalogue; **Tags** starts from tags alone. |
| **Avoid tags**         | See [below](#avoid-tags). Open by default.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Leans toward**       | Tags a result must have among its first 3, 5 or 10 tags: a game that is somewhat like that tag without it being the main one. A tag also stands for its related tags, and counts double in your taste (even if your library has none of it).                                                                                                                                                                                                                       |
| **Order**              | Niche ↔ Popular and Older ↔ Newer. These move games up and down; they never remove any.                                                                                                                                                                                                                                                                                                                                                                          |
| **Filters**            | Minimum review score (applied from 50 reviews) and minimum reviews, release years, length (How Long to Beat's main story, from the top 150 results), ProtonDB minimum (Linux), **Finished games only**, Singleplayer only, Hide Early Access, **Downloadable only**. Filters that need a lookup say how many games were left out.                                                                                                                                  |
| **Presets**            | **Moods** first: Something short, A long one, Hidden gems, Finished and polished, New this year, Co-op night (each sets a few filters, leaves Based on alone, and turns off again when clicked). Then your own: save the current settings under a name, switch, delete. **Reset** returns to the defaults and keeps your avoid list.                                                                                                                               |
| **Not interested (n)** | The games you hid, each with **Restore**.                                                                                                                                                                                                                                                                                                                                                                                                                          |

The settings, presets, games played elsewhere and Browse's saved searches are
one record in Hydra's database (`catalogueTaste`, version 2); Not interested
is its own (`catalogueNotInterested`).

### Avoid tags

A result is dropped when an avoided tag is among its first 5, 10 or 20 tags
(**A tag counts when it is among a game's**). **Also avoid related tags**, on
by default, adds the tags that mean nearly the same: Idler, Incremental and
Clicker; the multiplayer tags; the roguelike tags; Horror, Psychological Horror
and Survival Horror. Games with an avoided tag in their first five are also
left out of what your taste is learned from. When one family holds over 30 %
of your profile, Tune offers it: "Your profile leans on Idler (…). Avoid it?"

The list is one list: For you, Discover's shelves, the discovery queue, the
Charts filter and Steam's store search for candidates all use it; Browse uses
it when **Also leave out my avoid list** is on.

### Feedback from cards

The **✕** on a suggestion (hover) asks why, as YouTube does:

- **Not this game** hides it from For you, every Discover shelf except the
  AnkerGames ones, and the queue; a bar offers **Undo** for a few seconds.
  Browse and Charts still list it.
- **Not this kind: avoid _tag_** adds the rarest of its first three tags to
  the avoid list and hides the game.
- **Already played it** asks for an optional rating and logs the game as
  played outside Hydra: it is not suggested again and counts toward your
  taste like ten hours of play, times its rating.

The sparkle button, **More like this**, opens For you in Games mode with that
game. The game page's **More like this** section has the same as a link.

### Finished games

**Finished games only** needs to know when a game's public build last changed;
Steam's own API does not say, so Hydra asks steamcmd.net (a request a second,
kept a week) for the games at the top of the list, as many as it takes to
find 24. A game it cannot find a date for is left out and counted, never
treated as finished. A game's DLC releases are not counted. The first time
the shelf loads this can take half a minute.

## Hydra rating

One rating for every sort, chip and chart (`src/shared/store-rating.ts`).
Steam's share of positive reviews is pulled toward 50 % the fewer reviews
there are, by SteamDB's formula `p − (p − 0.5) × 2^(−log10(n + 1))`: 100 % of
40 reviews ranks below 96 % of 60,000. Under ten reviews the Steam part says
nothing. Metacritic, when it has a score, is blended in as
`(wₛ·steam + 0.35·critic) / (wₛ + 0.35)`, with `wₛ = 1 − 2^(−log10(n + 1))`,
so critics count most where players have said little. OpenCritic needs an
API key, so it is not used. The chip shows the rating with a star; its tooltip
lists the parts. The game page's **Reception** section keeps the separate
figures. Metacritic scores come from Hydra's shop details in batches of 60 and
are kept 30 days (`criticScores`).

How niche a game is stays out of the rating; it is what the Niche ↔ Popular
slider is for.

## Cache first

Discover's shelves, each chart and every set of Tune options keep what they
showed last in the database (`catalogueSnapshots`, 30 days, 40 entries). On
the next visit, also after a restart, that shows at once with the refreshing
icon until the new answer replaces it in one go. When the refresh fails the
old list stays; For you says from when. The recommender's candidates are kept
the same way for six hours.

## Charts

One table and a right-hand column with the chart picker and the filters. The
picker chooses what the chart ranks by; the **Released** filter chooses which
games, for every chart. The heading says both ("Best rated · released in
March 2026 · 500+ reviews"). The table shows rank, cover and title (with the
library badge), tags, the chart's own numbers, the [Hydra rating](#hydra-rating),
the release year (with **1.0** when the game left Early Access, the date on
hover) and, on Linux, ProtonDB's tier. Clicking a heading sorts by it (larger
first, then reversed, then back to the chart's order; **#** restores it).
After filtering, a rank's tooltip gives its place on the full chart. On a
narrow table the optional columns drop out. A row opens the game's page, also
for a Steam game the catalogue doesn't know.

| Chart                         | Source and what it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Playing now**               | Steam's top 100 by players in game now (kept 15 minutes), with the day's peak.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Most played today**         | Steam's top 100 by the day's peak (kept an hour), with places gained or lost since last week, or **New**, and **Days in top**: days in the top 100 of the last 30 that Hydra recorded (once 7 are recorded).                                                                                                                                                                                                                                                                                                           |
| **Trending**                  | From the same list: games that gained five places or more, or are new, by places gained.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Most played, 30 / 90 days** | From [steamcharts.com](https://steamcharts.com) (no API, so Hydra reads its pages, one a second). **30 days** ranks the top 200 games by players now by **player-hours** over the last 30 days. **90 days** ranks the 50 with the most player-hours by average players over roughly 90 days. If the site can't be reached the chart says so and falls back to Hydra's own record of Steam's daily top 100 (taken once a day while it runs, 120 days kept), with a "Collecting since…" notice until it has enough days. |
| **Best rated**                | The period's 500 most reviewed games from Hydra's search (it filters by year; the exact period is applied after), plus for any time Steam's own store search by user reviews (300 games, with the chart's tags and your avoid list), ranked by the Hydra rating; **Minimum reviews** (default 500) keeps a perfect score from a handful of players off the chart.                                                                                                                                                      |
| **Most reviewed**             | The same games by Steam review count: a rough measure of how many people played them.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Most anticipated**          | Steam's most followed upcoming games, with the announced release (a day, a month, a quarter or "Coming soon"). **Released** does not apply.                                                                                                                                                                                                                                                                                                                                                                            |

**Released**: Any time, Last 30 days, Last 3 months, Last 12 months, This
year, A year (with a year picker) or A month (month and year). On a players
chart a narrow period leaves few games; under ten, the chart says so and
offers **Best rated in this period**. Steam's own "top releases" list stopped
at February 2025, so it is not used.

Software and other non-games drop out of every chart. **Hide my games** and
the other filters apply to the loaded list: **Tags** (all of them), **Avoid
tags** (the [shared list](#avoid-tags)), **Minimum ProtonDB tier** (Linux),
**Singleplayer only** ([rule](#singleplayer-rule)), **Hide Early Access** and
**Free to play: Any / Only / Hide**. The chart and its filters are remembered.

A source that fails says so on the chart, naming the service, with **Try
again**; a list shown before stays.

### Singleplayer rule

A game counts when Steam lists it as a game (not DLC or software) with the
single-player category and without MMO, and the Singleplayer tag is among its
tags ahead of every multiplayer tag. Rainbow Six Siege and Helldivers 2 carry
the tag low in their lists and are left out; Baldur's Gate 3 lists it above
Co-op and stays in.

### Data

Steam's store pages (`IStoreBrowseService/GetItems`: reviews, release, tags,
player categories, developers, header image, 50 ids per request) are kept for
seven days in memory and in the database. Steam's store search
(`store.steampowered.com/search/results/?infinite=1`, no key, games only) is
asked one page at a time, a moment apart, and kept an hour. ProtonDB tiers are
fetched per game after the rows show, and kept for a day.

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
library** (Tags only: the eight tags that weigh most in your
[taste](#how-it-chooses)), then every value by
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

**Exclude tags** leaves out games with any of the chosen tags; **Also leave
out my avoid list** adds the [shared list](#avoid-tags) (off by default, so
Browse still shows the whole catalogue). **Players** (Single-player, Co-op,
Online PvP, Local multiplayer) keeps games that offer all the chosen kinds.
**Release year** has decade chips (2020s, 2010s, 2000s, Before 2000) above its
slider. **Saved searches** keeps the filters and sort under a name.

**Two searches, one page.** Hydra's catalogue search can't leave tags out,
sort by reviews or filter by players. When a request needs one of those (and
no download source, genre, developer, publisher, ProtonDB, Steam Deck or year
filter), Browse asks Steam's store search instead and says so under the count
("From Steam's store search", the reason on hover); each page of **Best rated**
is then put in Hydra rating order. When it needs both, Hydra's search runs and
games that don't pass are hidden from each loaded page, and the count says
"About". Sorts: Popularity, Newest, Oldest, Title A–Z and Z–A, **Best
rated**, **Popular on Hydra** (Hydra's own `hydraScore`, which ranks hype among
Hydra users and was called Highest rating before) and Most reviewed.

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
