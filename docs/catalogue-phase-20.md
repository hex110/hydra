# Catalogue, phase 20: spec and plan

Written 2026-11-03 with the owner. This is the document to start from when
implementing roadmap phase 20 (**Catalogue: Discover, Charts, Browse**). It
says what to build, in which order, what the owner decided, which data
sources were checked, and how to check each step. Steps are written to be
implemented one at a time by an agent that has not seen the conversation
they came from: when a step names a file, function or endpoint, it was
checked on 2026-11-03.

- What exists today: [Catalogue](features/catalogue.md) (front page, grid,
  row data, library state, load more) and the shared patterns in
  [Game page → Patterns across pages](features/game-page.md#patterns-across-pages).
- The rules every step follows: `CLAUDE.md` (worktrees, UI consistency, i18n,
  logger) and the [Principles](roadmap.md#principles).

## Goal

The catalogue is Hydra's Steam store. Today it is one long page: shelves with
their own card design on top, then **All games** with the filters. The
controls in the header (List/Grid, Hide my games, Sort) only reach the list at
the bottom, the shelves have no order by purpose, the filter lists are long
and alphabetical, and the recommendations are "similar to what you played
most", which surfaces idle games for anyone whose most played game is an
idle game.

After phase 20 the catalogue is three tabs built from one set of components:

- **Discover**: shelves grouped by purpose (for you, popular, new, explore),
  each with **See all**.
- **Charts**: SteamDB-style lists of what is played and what is good, with
  stats.
- **Browse**: the full catalogue with filters, as today's All games.

…and a recommender of its own, with a **Tune** panel, that works from the
whole library, signed out, with no API key.

## Owner decisions (2026-11-03)

1. **Tabs**: Discover, Charts, Browse.
2. **Cards**: wide Steam header images (460×215) for every store card in the
   catalogue. Home suggestions move to the same card.
3. **Third-party data**: SteamSpy and steamcmd.net are fine. If one stops
   working, the feature that uses it says so and we change the approach then.
4. **AnkerGames rows stay on Discover**, under **New**.
5. **Avoid tags is a first-class control**, not a buried option. The owner's
   most played game by far is Clicker Heroes, and every recommender built on
   Steam playtime recommends idle games to them. Hydra must not, by default
   (see [Idle playtime](#idle-playtime)) and by choice (Avoid tags).

## Data sources (checked 2026-11-03)

All of these answered without a key or login.

| Source                                                            | Request                                                                                                                       | What it gives                                                                                                                                                                                                                                                                            | Used for                                                 |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Hydra catalogue search                                            | `POST /catalogue/search` (`take` ≥ 5)                                                                                         | `{ count, edges }`; edges carry `releaseYear`, `tier` (ProtonDB, often null), `deckCompatibility`, `downloadSources`. No facet counts.                                                                                                                                                   | Browse, filter counts, recommender candidates            |
|                                                                   | `sortBy: "hydraScore"`                                                                                                        | Best rated first (ULTRAKILL, RDR2, Hollow Knight)                                                                                                                                                                                                                                        | "Highest rated" (already in the menu)                    |
|                                                                   | `sortBy: "reviewScore"`                                                                                                       | Most reviewed first (CS2, Dota 2, GTA V) — it is a review _count_ order                                                                                                                                                                                                                  | New "Most reviewed" sort                                 |
| Steam `IStoreBrowseService/GetItems/v1`                           | `data_request: { include_reviews, include_release, include_tag_count: 20, include_basic_info, include_assets }`, up to 50 ids | `type` (0 = game), `tags[{tagid, weight}]`, `reviews.summary_filtered.{review_count, percent_positive, review_score, review_score_label}`, `release.steam_release_date` (unix s), `categories.supported_player_categoryids`, `basic_info.{developers, publishers, franchises}`, `assets` | Card facts, recommender, singleplayer test               |
| Steam `ISteamChartsService/GetMostPlayedGames/v1`                 | none                                                                                                                          | Top 100 by daily peak: `rank`, `appid`, `last_week_rank` (−1 = new), `peak_in_game`; `rollup_date`                                                                                                                                                                                       | Charts: most played today, trending, daily snapshots     |
| Steam `ISteamChartsService/GetGamesByConcurrentPlayers/v1`        | none                                                                                                                          | Top 100 now: `rank`, `appid`, `concurrent_in_game`, `peak_in_game`; `last_update`                                                                                                                                                                                                        | Charts: playing now                                      |
| Steam `ISteamChartsService/GetTopReleasesPages/v1`                | none                                                                                                                          | Monthly pages: `name`, `start_of_month`, `item_ids[{appid}]`                                                                                                                                                                                                                             | Charts: top releases by month; candidates                |
| Steam `store.steampowered.com/tagdata/populartags/english`        | none                                                                                                                          | 429 tags by popularity (already used)                                                                                                                                                                                                                                                    | Tag names and order                                      |
| SteamSpy `api.php?request=tag&tag=Singleplayer`                   | about 1 request a second                                                                                                      | 52,822 games, **17.6 MB**: `ccu` (yesterday's peak), `positive`, `negative`, `owners`. `average_2weeks` is **0 for every game**: SteamSpy's playtime data no longer works, so no playtime column.                                                                                        | Charts: singleplayer candidates                          |
| SteamSpy `top100in2weeks`, `top100forever`                        | same                                                                                                                          | Same fields                                                                                                                                                                                                                                                                              | Charts candidates                                        |
| steamcmd.net `api.steamcmd.net/v1/info/<appid>`                   | about 1 request a second, be polite                                                                                           | `data.<appid>.depots.branches.public.timebuildupdated` (unix s), `common.steam_release_date`, `extended.listofdlc`                                                                                                                                                                       | "Finished" test                                          |
| ProtonDB `www.protondb.com/api/v1/reports/summaries/<appid>.json` | per game                                                                                                                      | `tier`, `trendingTier`, `confidence`, `total`                                                                                                                                                                                                                                            | ProtonDB minimum for candidates the search didn't return |

Not available: `IStoreQueryService/Query` (Steam's filtered store query)
returns nothing without a key. Steam's interactive recommender needs a Steam
login and a public profile. RAWG's suggestions are paid, IGDB needs the user's
own Twitch keys, and Backloggd has no API (see
[Home → Other sources](features/home.md#other-sources)).

Steam ids used below (from `populartags` and Hydra's `/catalogue/steam/tags`):

- Idle family: Idler `615955`, Incremental `560542`, Clicker `379975`.
- Multiplayer family: Multiplayer `3859`, Massively Multiplayer `128`,
  MMORPG `1754`, PvP `1775`, Co-op `1685`, Online Co-Op `3843`, Local
  Multiplayer `7368`, Local Co-Op `3841`, Co-op Campaign `4508`, Asynchronous
  Multiplayer `17770`.
- Roguelike family: Roguelike `1716`, Roguelite `3959`, Action Roguelike
  `42804`, Traditional Roguelike `454187`, Roguelike Deckbuilder `1091588`.
- Singleplayer `4182`, Early Access `493`, Free to Play `113`, Casual `597`,
  2D `3871`, Souls-like `29482`, Point & Click `1698` (not idle!).
- Steam player categories: `2` single-player, `1` multi-player, `9` co-op,
  `20` MMO, `36` online PvP, `38` online co-op, `49` PvP.

## What the references taught us

The owner pointed at three recommenders; what we take from each:

- **SteamPeek**: include _and_ exclude tag lists, a similarity threshold, a
  time window ("games between … last 360 days"), a minimum rating, and
  sorting by similarity, recommendation, newest or trending. Our Tune panel
  has each of these.
- **Nodal**: blends a behaviour signal (games owned or played by the same
  people move closer) with a content signal (tags), and keeps the ordering
  controls (popularity, quality, recency) separate: "This does not change
  which games are considered similar, only how the final list is ordered."
  We do the same. Steam's "More like this" list is our behaviour signal; tag
  similarity is the content signal; the Tune sliders re-rank.
- **NextSteamGame**: retrieve a candidate pool, then re-rank it against the
  user's preferences, and merge tags that mean nearly the same thing so that
  niche distinctions survive. We keep its retrieve-then-rerank shape and its
  tag merging, as a small hand-written table of **tag families** (above).
  We skip its review-text LLM pipeline: it needs a server and an offline
  build.

## Shape of the page

```
Catalogue                                          [ header search ]
[ Discover ] [ Charts ] [ Browse ]                 ← tabs, sticky
-------------------------------------------------------------------
Discover:  shelves, full width, no sidebar
           For you → See all opens "For you" with the Tune panel on the right
Charts:    table on the left, chart picker and chart filters on the right
Browse:    toolbar (count, sort, view, hide my games, active filters)
           results on the left, filters on the right
```

The right-hand column always holds the controls for what is on the left,
built from `SidebarSection`. One switch, **Hide my games**, applies to every
tab.

## Work, in order

Each step lands on its own in its own worktree, with its docs updated, and
is checked as described under [Checking](#checking). Roadmap phase 20 lists
the same steps.

### Step 1. One store card, one store row

Today the catalogue uses three card designs: `Capsule` and the queue card in
`pages/catalogue/catalogue-front-page.tsx`, and `GameItem`
(`pages/catalogue/game-item.tsx`) with a list and a grid layout. The patterns
doc claims the catalogue grid uses `VerticalCoverCard`; it doesn't. Replace
all of them.

**Facts type.** Rename `CatalogueRowDetails` (`src/shared/catalogue-row-details.ts`)
to `StoreGameFacts` and extend it:

```ts
export interface StoreGameFacts {
  criticScore: number | null;
  howLongToBeatHours: number | null;
  downloadSize: number | null;
  screenshots: string[];
  tagIds: number[]; // most voted first, up to CATALOGUE_ROW_TAGS
  reviewPercent: number | null; // Steam summary_filtered.percent_positive
  reviewCount: number | null; // summary_filtered.review_count
  releaseYear: number | null; // from the search edge, else GetItems release
}
```

In `src/main/services/steam-tags.ts`, `requestStoreTagIds` already calls
`GetItems`; add `include_reviews: true` and `include_release: true` to the
same request and return reviews and release with the tag ids (rename to
`getSteamStoreFacts`, keep the six-hour cache). No extra request per row.
`buildCatalogueRowDetails` becomes `buildStoreGameFacts`; update its tests
(`src/shared/catalogue-row-details.test.ts`) and add cases for the new fields.
The IPC name `getCatalogueRowDetails` and the hook
`use-catalogue-row-details.ts` keep their names (they are about rows on
screen) but return `StoreGameFacts`.

**Review tone.** Add `getReviewTone(percent, count)` next to
`getCriticScoreTone`: `positive` at 70 % and up, `mixed` 40–69, `negative`
below 40, `null` under 10 reviews (Steam shows no score then). Colours are
tokens in `globals.scss` (`$review-positive`, `$review-mixed`,
`$review-negative`), Steam's blue, tan and orange-red.

**Components**, all in `src/renderer/src/components/`:

- `store-game-card/`: `StoreGameCard`. Props: `game` (`shop`, `objectId`,
  `title`, `libraryImageUrl`, `platform?`), `facts?: StoreGameFacts`,
  `libraryState?`, `reason?: string`, `badge?: ReactNode` (an AnkerGames
  version, a chart rank), `canDownload?`, `onNotInterested?`, `size: "shelf" |
"grid"`. Layout: the 460×215 header image (aspect ratio 92 / 43) with the
  `GameLibraryBadge` overlay top-left, ProtonDB badge bottom-right (Linux
  only, as today) and the hover screenshot preview; under it the title (one
  line, ellipsis), then `reason` when given (muted, one line), then the meta
  line. The whole card is a `Link` to `buildGameDetailsPath(game)`.
- `store-game-row/`: `StoreGameRow`, the same content in a row (cover 200×94
  on the left), for Browse's list view. Charts uses `StoreGameTable` (step 5),
  which reuses the same cells.
- `store-game-meta/`: `StoreGameMeta` renders the meta line used by both:
  up to three tag names (from `useSteamTagLabels`), then chips: review %
  (toned, tooltip "Very Positive · 62,210 reviews" built from the count), the
  release year, How Long to Beat hours (`ClockIcon`), download size
  (`DownloadIcon`), Metacritic (toned, as today) and `badge`. Chips that have
  no value are left out; with no facts yet, a one-line skeleton.
- `store-game-actions/`: `StoreGameActions` and `useStoreGameActions(game,
libraryState)`: the +, wishlist star and Download buttons, moved from
  `game-item.tsx` with their behaviour unchanged, plus **Not interested**
  (`XIcon`, only when `onNotInterested` is passed). Shown on hover and on
  keyboard focus inside the card, top-right of the cover.
- Move `useHoverPreview` from `game-item.tsx` to `src/renderer/src/hooks/`.
- `store-shelf/`: `StoreShelf`. Props: `title`, `subtitle?`, `onSeeAll?`,
  `isLoading`, `isRefreshing?`, `children`. The header has the title, the
  refreshing icon (as today for AnkerGames) and a **See all** link on the
  right. The row is a CSS grid with `grid-auto-flow: column` and
  `grid-auto-columns` sized so whole cards fit (container queries on the
  shelf: under 900 px 2 cards, under 1300 px 3, under 1700 px 4, otherwise 5),
  `overflow-x: auto` with `scrollbar-width: none` and scroll-snap per card.
  Previous and next buttons at the ends scroll by one visible width and hide
  at the start and end. The vertical wheel keeps scrolling the page. While
  loading, as many `StoreGameCardSkeleton`s as fit.
- `StoreGameCardSkeleton` uses `SkeletonTheme` with the token colours. The
  front page has no `SkeletonTheme` today, which is why its skeletons are
  bright white.

**Replace:** `GameItem` (list and grid) with `StoreGameRow` and
`StoreGameCard size="grid"`; `Capsule` and the shelves with `StoreShelf` and
`StoreGameCard size="shelf"`. AnkerGames cards pass their version as `badge`
(a muted "v1.0.0" chip) instead of using it as the only subtitle. Classics
keep `GameItemClassics`. Delete `game-item.tsx` and `game-item.scss` once
nothing imports them.

**Discovery queue**, rebuilt compact (at most 260 px tall): the cover on the
left at shelf size, and on the right the title, `reason`, `StoreGameMeta`,
the position ("3 of 24") and **Open**, **Add to library**, **Not
interested** and **Next**. Not interested here is the same action as on
cards (step 7); until step 7 lands, leave it out.

**As built (step 1).** Skeletons take their colours from CSS custom
properties set from tokens in the card's SCSS rather than a `SkeletonTheme`,
which would need raw colours in TSX. The shared `.store-game` styles and the
cover (`StoreGameCover`, with the ProtonDB badge moved in beside it) live in
`components/store-game-card/` and the row imports them. `StoreGameChip`
(exported with `StoreGameMeta`) is the muted chip used for an AnkerGames
version. Download-source names, which the old catalogue rows showed, are
kept: Browse passes them as `sources` and the card or row shows them on one
line under the facts. `getReviewLabel` (Steam's wording from percent and
count) sits next to `getReviewTone` in `src/shared/catalogue-row-details.ts`.

Update the patterns table in `docs/features/game-page.md`: a store game is a
`StoreGameCard` or `StoreGameRow`; `VerticalCoverCard` stays for portrait
covers outside the catalogue (friends playing, similar games) until step 9.

### Step 2. Tabs and toolbars

- Add `tab: "discover" | "charts" | "browse"` to the catalogue slice
  (`src/renderer/src/features/catalogue-search.ts`), default `"discover"`,
  with `setCatalogueTab`. In the same slice, `setFilters` switches `tab` to
  `"browse"` whenever the resulting filters differ from the defaults in
  anything other than `sortBy`/`sortOrder` (a search, a tag, a year). So the
  header search (`components/header/header.tsx`, `executeSearch`), a tag
  click on the game page (`pages/game-details/sidebar/genres-section.tsx`),
  the download-sources settings link and **See all** all land on Browse
  without each having to know about tabs. `clearFilters` does not change the
  tab.
- The tab strip sits under the page title and stays visible while scrolling.
  Use the same tab component as the library's source tabs
  (`pages/library/category-filter.tsx`); if it is page-specific, move it to
  `components/` first and use it in both places. Modern/Classics moves from the
  sidebar's `CatalogueModeToggle` into Browse's toolbar as a
  `SegmentedControl`, and choosing Classics selects Browse.
- **Discover** has no toolbar and no sidebar; it shows the shelves full width.
- **Browse** toolbar, one sticky row: result count ("213,438 games"), sort,
  List/Grid (`SegmentedControl` with icons), and the active-filter chips with
  **Clear filters** under it when there are any. "Use the sidebar to refine
  your search" goes. Sort options: Popularity, Highest rated (`hydraScore`),
  **Most reviewed** (`reviewScore`, new), Newest, Oldest, Title A–Z, Title Z–A.
  Lowest rated goes (nobody browses by it).
- **Hide my games** moves to the tab strip's right end, as a labelled toggle
  that applies to all three tabs. Discover shelves follow it too, except the
  two AnkerGames shelves, which show the site's rows whole (the current
  rule).
- The page title row keeps only the title. Keep the scroll position per tab
  (the Browse cache in `catalogue-results-cache.ts` already does this for
  Browse; Discover and Charts keep theirs in the same module, keyed by tab).
- Big Picture's catalogue (`BigPictureCatalogue`) is out of scope.

**As built (step 2).** The page is `catalogue.tsx` (tab strip, Hide my
games, library state, one scroll container), with `CatalogueBrowse`
(`catalogue-browse.tsx`), `CatalogueFrontPage` (Discover) and
`CatalogueCharts`. The tab strip is a new shared `TabStrip` in
`components/tab-strip/`, which the library's `CategoryFilter` now uses.
`SegmentedControl` options take an optional icon. Discover's and Charts'
scroll positions live in `catalogue-tab-scroll.ts` and the restore retries
while shelves load. Classics also selects Browse (in `setMode`). There is no
page title row of its own: the app header already says "Catalogue".

### Step 3. Filter sidebar

**Counts per filter value.** A main-process job, `src/main/services/catalogue-facet-counts.ts`,
counts the games for every tag and genre with `POST /catalogue/search`,
`take: 5`, one filter value per request, concurrency 4, about 500 requests.
It runs at most once a day, the first time the catalogue opens, and stores
`{ checkedAt, tags: Record<id, count>, genres: Record<name, count> }` in a new
sublevel (`catalogueFacetCounts`, in `src/main/level/sublevels/`, key added
to `keys.ts`). A value whose request failed keeps yesterday's count; a first
run with failures keeps what it got and retries the failed ones on the next
open. IPC: `getCatalogueFacetCounts()` and an event `onCatalogueFacetCountsUpdated`
when a run finishes. This replaces the renderer's 45-tag empty check in
`hooks/use-popular-steam-tags.ts` (a tag with count 0 is empty); keep the
hook's `tags` order for places that want Steam's popularity.

The search response has no facet counts, so the counts are for the whole
catalogue, not for the current filters. Say so in the section's tooltip
("Games in the catalogue with this tag"). Live counts would take one request
per value on every change.

**Order.** In Genres and Tags: selected values first, then **From your
library** (Tags only: the eight tags with the most playtime in your library,
from the recommender's profile in step 6, or until then from the library
metadata genres weighted by playtime), then every value by count, highest
first. Each item shows its count after the label in parentheses, in the muted
text colour, formatted with `formatNumber`. Values with count 0 are hidden
unless selected. The filter box only shows above ten items.

**Genres** leaves out software and media categories: Accounting, Animation &
Modeling, Audio Production, Design & Illustration, Education, Photo Editing,
Software Training, Utilities, Video Production, Web Publishing, Game
Development, Documentary, Tutorial. Keep the list in `src/shared/` as
`NON_GAME_STEAM_GENRES`.

**Developers and publishers** become type-to-search fields instead of
thousand-item lists: under the field, **From your library** lists the five
developers (or publishers) with the most playtime in your library, then
matches as you type (first 50). Selected ones show as chips under the field.

**Chrome.** Every section becomes a `SidebarSection`. It lives in
`pages/game-details/sidebar-section/` then (moved to `components/sidebar-section/` with step 5); move it to
`components/sidebar-section/` first and update its 13 imports. Sections start
collapsed, except Tags and any section with a selection. The "N available"
line and the per-section coloured orbs go. The category colours in
`catalogue.tsx` (`filterCategoryColors`, raw hex and HSL) move to tokens or
go. The active-filter chips keep a colour per category from those tokens.
ProtonDB gets an explicit **Any** option first.

**Narrow windows.** Below 1100 px the sidebar becomes a **Filters (n)**
button in the Browse toolbar that opens it as a drawer over the results.

### Step 4. Store data in the main process

Shared services for steps 5–8. Pure parsing goes in `src/shared/` with
tests; requests and caches in `src/main/services/`. Every service logs
failures with `logger.warn` and returns `null` for "could not reach", never
throws into IPC.

- `steam-store-items.ts`: `getStoreItems(appIds)` → `Map<appId, StoreItem |
null>` from `GetItems` with `include_reviews`, `include_release`,
  `include_tag_count: 20`, `include_basic_info`, `include_assets`, in batches
  of 50. `StoreItem`: `appId`, `title`, `type`, `tags: SteamTagWeight[]`,
  `reviewCount`, `reviewPercent`, `reviewLabel`, `releaseDate` (ms),
  `isEarlyAccess` (tag 493 among the first 10 tags), `isFree`,
  `playerCategories: number[]`, `developers`, `publishers`, `franchise`,
  `headerImageUrl`. Cached in memory and in a sublevel (`steamStoreItems`)
  for seven days, since the recommender asks for hundreds of games.
  `steam-tags.ts` (step 1) may call this instead of its own request.
- `steam-charts.ts`: `getMostPlayed()` (one hour), `getPlayingNow()` (15
  minutes), `getTopReleases()` (one day). Parsers in `src/shared/steam-charts.ts`.
- `chart-snapshots.ts`: once a day, the first time Charts or Discover asks,
  stores the `GetMostPlayedGames` ranks under the date of its `rollup_date`
  (`YYYY-MM-DD`) in a sublevel (`chartSnapshots`), keeping 120 days.
  `getSnapshotRanking(days)` returns games ranked by the sum of `101 − rank`
  over the days in the window that have a snapshot, plus how many days that
  was.
- `steamspy.ts`: a request queue with one request a second. `getSpyTag(name)`
  downloads the tag list (17 MB for Singleplayer), keeps only the top 500 by
  `ccu`, and caches that in memory and in a sublevel for 24 hours. Also
  `getSpyTop("top100in2weeks" | "top100forever")`.
- `steam-build-dates.ts`: `getLastBuildUpdate(appIds)` from steamcmd.net,
  `timebuildupdated` of the public branch (ms) or `null`. Concurrency 1 with
  one second between requests, cached in a sublevel for seven days (a
  build date only moves forward; a cached date younger than the window still
  answers "not finished").
- `protondb.ts`: `getProtonDbTier(appId)`, cached a day; used only for
  candidates whose search edge had no `tier`.

Pure helpers in `src/shared/store-games.ts`, each with tests:

- `isSingleplayerGame(item)`: `type === 0`, player categories include 2 and
  not 20, Singleplayer (4182) is among the tags, and comes before every tag
  of the multiplayer family. (Rainbow Six Siege and Helldivers 2 carry the
  Singleplayer tag, low in their lists; Baldur's Gate 3 lists it above Co-op.)
- `isFinishedGame(item, lastBuildUpdate, now, months = 12)`: released at
  least `months` ago, not Early Access, and the public build not updated for
  `months`. `null` when the build date is unknown (shown as unknown, never as
  finished). DLC releases are not counted; steamcmd's `listofdlc` gives ids
  but not dates, and fetching each DLC is too much. Say so in the feature doc.
- `wilsonLowerBound(percentPositive, count)` (95 %), used as "quality" with
  `0.5` when the count is under 10.
- `TAG_FAMILIES` and `expandTagFamilies(tagIds)`: the families listed under
  [Data sources](#data-sources-checked-2026-11-03), plus Horror (Horror,
  Psychological Horror, Survival Horror) and Souls-like with Soulslike-adjacent
  tags only if they exist in the tag list. Look the ids up from
  `/catalogue/steam/tags` when writing the table; don't guess.

**As built (step 4).** `getStoreItems`, the charts, snapshots, SteamSpy and
ProtonDB services are as described, with `StoreItem` and the pure helpers
(`isSingleplayerGame`, `isFinishedGame`, `wilsonLowerBound`, `TAG_FAMILIES`)
in `src/shared/store-games.ts` and the chart parsers in
`src/shared/steam-charts.ts`, all tested. Not built yet: **steamcmd build
dates** (`steam-build-dates.ts`; only Finished games need them) and the
Horror and Souls-like tag families (their ids are still to be looked up).
`getProtonDbTiers` returns tiers for the Charts table, not candidates.

### Step 5. Charts

A table, a chart picker and chart filters.

**Charts** (picker in the right column, a `SidebarSection` with one radio
list):

1. **Playing now**: `getPlayingNow()`. Columns: players now, today's peak.
2. **Most played today**: `getMostPlayed()`. Columns: daily peak, movement
   against last week (`▲ 3`, `▼ 2`, **New** when `last_week_rank` is −1).
3. **Trending**: from the same list, games that gained 5 or more places
   since last week or are new, by places gained.
4. **Most played singleplayer**: candidates are the union of `getSpyTag("Singleplayer")`'s
   top 500, `getPlayingNow()` and `getMostPlayed()`, kept when
   `isSingleplayerGame`; ranked by current players when the game is in
   `getPlayingNow()`, else by SteamSpy's `ccu`. The column header says
   "Players (yesterday's peak)" for SteamSpy numbers.
5. **Most played, 30 days** and **90 days**: `getSnapshotRanking(30 | 90)`.
   Until the window has 7 (for 30) or 30 (for 90) days of snapshots, show
   the list with a notice: "Hydra records Steam's daily chart while it runs.
   Collecting since 3 November: 4 of 30 days." Two weeks comes from
   `getSnapshotRanking(14)` the same way.
6. **Top releases**: `getTopReleases()`, a month picker (newest first).
7. **Best rated**: Hydra search with `sortBy: "hydraScore"`, 100 games,
   enriched with `getStoreItems`; a minimum review count filter (default
   1,000) drops tiny games with a perfect score.

**Table**: `StoreGameTable` in `components/store-game-table/`, cells shared
with `StoreGameRow`. Columns: rank, cover and title (with library badge),
top three tags, review % (toned), the chart's numbers (above), release year,
ProtonDB tier (Linux), and the action buttons on hover. Sort by clicking a
column header, as in the library's list view (`pages/library/library-list-header.tsx`).
The chart's own order is the default; clicking it again restores it.

**Chart filters** (right column, under the picker): Tags (include), **Avoid
tags** (the same control as in Tune, step 7, sharing its saved list),
ProtonDB minimum, Singleplayer only, Hide Early Access, Free to play: any,
only, hide. All of them filter the loaded list client-side, which is honest
here: a chart is at most a few hundred games, all loaded.

Every row's title opens the game page; a game the catalogue doesn't know
(not every Steam app is in Hydra's catalogue) still opens
`buildGameDetailsPath({ shop: "steam", objectId })`, which already handles
unknown games.

A source that fails shows its chart's empty state with the reason ("Steam's
charts could not be reached. Try again."), not a blank table. SteamSpy and
steamcmd failures name the service.

**As built (step 5).** The main process assembles each chart
(`catalogue-charts.ts`, one IPC `getCatalogueChart`) and the renderer filters it
(`filterChartRows` in `src/shared/catalogue-charts.ts`, tested). `StoreGameTable`
takes columns from the caller; its optional columns drop out below 820 px.
The chart filters, including Avoid tags, are saved in `localStorage` for now:
step 7 moves the avoid list to the shared saved settings. `TagPicker`
(`components/tag-picker/`) is the tag search with chips that Tune reuses.
Singleplayer candidates are SteamSpy's top 500 plus both Steam charts, which
is about 600 store requests' worth on first load (12 batches, then cached for
a week). "Two weeks" has no chart of its own.

### Step 6. The recommender

Pure functions in `src/shared/recommender/` (tested with fixtures), the
orchestration in `src/main/services/recommender.ts`, one IPC
`getRecommendations(options: TuneOptions)` returning `{ profile, results }`.
It runs in the main process because it reads the library (`gamesSublevel`),
play activity (`playActivity` sublevel) and ratings directly.

#### Profile

For each library game with a Steam app id (its own, or its `catalogueGame`'s;
group copies with `groupLibraryGames` so a game counts once), compute a seed
weight:

- **Playtime**: `log2(1 + hours)`. In **All time** mode, hours is the total
  playtime, multiplied by `1 + min(1, last90 / total)` so recent play counts
  up to twice. In **Recent** mode, hours is the play in the last 90 days from
  play activity only.
- <a id="idle-playtime"></a>**Idle playtime**: if the game has a tag of the
  idle family among its first five tags, its hours count at 10 %. Idle games
  run in the background, so their playtime is not attention. This is on by
  default, shown in the profile ("Clicker Heroes: idle game, playtime counted
  at 10 %"), and can be turned off in Tune.
- **Rating** (Hydra's 1–10, which Floppy keeps in step): 9–10 ×1.6, 7–8
  ×1.25, 5–6 ×0.8, 3–4 ×0 (ignored), 1–2 ×−0.5. No rating ×1.
- **Status**: Finished ×1.25 and at least the weight of 10 hours; Dropped
  ×−0.5; Backlog or wishlisted with no playtime count as 0.3 (intent).
- **Cap**: no single game supplies more than 20 % of the total absolute
  weight; the excess is cut.
- **Excluded**: games the user removed from **Based on** in Tune, and games
  whose first five tags include an avoided tag (so an avoided Clicker Heroes
  doesn't leak Casual and 2D into the profile either).

The taste vector is the weighted sum of each seed's tag vector (the existing
`toVector` in `src/shared/similar-games.ts`, exported: `sqrt(weight /
topWeight)` over the first 15 tags), divided by the total absolute weight.
Negative seeds subtract. Feature tags that describe the format, not the taste
(Singleplayer, Free to Play, Early Access, Controller, Great Soundtrack, the
`SHELF_EXCLUDED_TAGS` in `catalogue-front-page.tsx`, moved to `src/shared/`)
are left out. The profile returned to the renderer: the top 20 seeds with
weight and notes (idle, rating, capped), the top 15 tags with their share, and
`dominantFamily` when one tag family holds more than 30 % of the vector.

#### Candidates

Retrieve, then re-rank (NextSteamGame's shape). Union, up to about 800 app
ids:

1. Steam's "More like this" for the top eight seeds
   (`getSteamSimilarGames`, `src/main/services/steam-similar.ts`), keeping
   each list's order: the behaviour signal.
2. Hydra search for each of the top six taste tags, `take: 40`, once by
   `hydraScore` and once by `popularity`, with the Tune filters the search
   supports (release years, ProtonDB minimum, your sources' fingerprints when
   **Downloadable only**). Request in sequence, not 24 at once.
3. Top releases of the last 12 months (`getTopReleases()`).

Remove owned games (`getOwnedKeys` in `pages/home/home-sections.ts`; move it
to `src/shared/` if main needs it), Not interested, dropped and secondary
releases (`isSecondaryRelease`). Enrich everything with `getStoreItems` and
drop non-games (`type !== 0`).

#### Scoring

- `similarity`: cosine between the taste vector and the candidate's vector,
  with the IDF over the candidate pool (as `rankSimilarGames` does).
- `behaviour`: if the candidate is in seed s's "More like this" list at
  index i of n: `normalisedWeight(s) × (1 − i / n)`, the best over seeds; else 0.
- `quality`: `wilsonLowerBound(reviewPercent, reviewCount)`.
- `relevance = 0.6 similarity + 0.25 behaviour + 0.15 quality`.

Then the Tune controls (Nodal's rule: they change the order, not what counts
as similar):

- **Popular ↔ niche**, −1…1: `+ 0.25 × p × (popularity − 0.5)`, with
  `popularity = min(1, log10(1 + reviewCount) / 5)`.
- **Older ↔ newer**, −1…1: the same with the release year scaled over
  2000–now.

Hard filters, applied before the diversity pass:

- Minimum review score (default 70 %, applied from 50 reviews) and minimum
  reviews (default 50).
- **Avoid tags**: removed when an avoided tag (with its family, when **Also
  avoid related tags** is on, the default) is among the candidate's first
  _N_ tags; _N_ is **Strictness**: 5 (default), 10 or 20.
- **Leans toward** tags: each chosen tag (or family member) must be among
  the candidate's first _D_ tags, _D_ = 3, 5 (default) or 10. The owner's
  "rough genres": the game is somewhat like that tag without it having to be
  the main one. Chosen tags also get double weight in the taste vector.
- Release years; ProtonDB minimum; Singleplayer only; Hide Early Access.
- **Length** (How Long to Beat main story: under 5 h, 5–15, 15–40, over 40):
  fetched only for the top 150 after scoring, through `getCatalogueRowDetails`.
- **Finished games only** (`isFinishedGame`, 12 months): build dates fetched
  only for the top 150; unknown dates are dropped from this filter and
  counted ("12 games left out: build date unknown").
- **Downloadable only**: the existing check (`game.downloadSources` and
  `hasLocalSourceRepacks`), for the top 150.

**Diversity**: pick greedily, each time the candidate maximising
`0.8 × score − 0.2 × (highest cosine to anything already picked)`, with at
most three games per "because of" seed and two per developer or franchise.

**Reason** per result: the seed that contributed most ("Because you played
Hades"), the two tags that contributed most to `similarity` ("Action
Roguelike, Hack and Slash"), and the review label. Shown on the card as
`reason` (first part), the rest in its tooltip.

Cache the profile and candidate pool for six hours (in memory), keyed by the
library's state (game keys, playtime rounded to the hour, ratings, statuses)
and the options that change retrieval (mode, years, ProtonDB, downloadable);
the re-rank options don't invalidate the pool.

**Tests** (in `src/shared/recommender/*.test.ts`): a fixture library with
Clicker Heroes at 3,000 hours and Hades, Hollow Knight and Celeste at 30–80
hours must produce a profile led by Hades/Hollow Knight-style tags with idle
playtime on, and with Idler avoided, no seed with idle tags and no candidate
with an idle tag in its first five. Also: a dropped game's tags pull down;
the 20 % cap holds; diversity keeps at most three per seed; leans-toward
depth 3 drops a game whose matching tag is sixth.

### Step 7. For you and Tune

**For you** is a view inside Discover: Discover's first shelf's **See all**
opens it (`tab: "discover"`, `view: "for-you"` in the slice), with a back
link to Discover. Results on the left in grid or list (the same toggle and
components as Browse), 60 at a time with Load more; the **Tune** panel on the
right, in `SidebarSection`s:

1. **Based on**: All time / Last 90 days / Picked games. Below it the top
   seeds as chips with their share ("Hades 14 %"); a chip's ✕ removes the game
   from the profile, and Picked games starts from an empty list with a search
   of your library to add to. "Count idle games' playtime at 10 %" toggle.
2. **Avoid tags** (open by default): a tag search; chosen tags as chips;
   **Also avoid related tags** (on); Strictness 5 / 10 / 20. When the profile
   has a `dominantFamily`, a line above the search offers it: "Your profile
   leans on Idler (Clicker Heroes, 3,200 h). Avoid it?" with **Avoid**.
3. **Leans toward**: a tag search, chips, depth 3 / 5 / 10.
4. **Sliders**: Popular ↔ Niche, Older ↔ Newer. Use or add a range-input
   primitive in `components/` (the release-year slider in
   `pages/catalogue/release-year-section.tsx` is the starting point).
5. **Filters**: minimum review score, minimum reviews, release years, length,
   Finished games only, Singleplayer only, Hide Early Access, ProtonDB minimum,
   Downloadable only.
6. **Presets**: save the current settings under a name, switch between them,
   delete; **Reset** returns to the defaults.
7. **Not interested (n)**: the list with **Restore** per game.

Changes re-rank immediately (debounced 300 ms) without refetching unless a
retrieval option changed; a refetch shows the current results dimmed with a
spinner, not skeletons.

**Saved state**, in main through IPC (`getTuneSettings`, `setTuneSettings`),
one record in a new sublevel (`catalogueTaste`): the active options, the
avoid list and the presets. **Avoid tags** are shared by every surface: For
you, Discover's shelves, the discovery queue, home suggestions and the Charts
filter. **Not interested** is its own sublevel (`catalogueNotInterested`,
keyed `shop:objectId`, value `{ at }`): hidden from For you, every Discover
shelf except AnkerGames' and the queue, and home suggestions; Browse and
Charts still list the game. Marking a game shows a toast with **Undo**.

### Step 8. Discover, grouped by purpose

Top to bottom, each group with a small heading:

1. **For you**: the top result large (a hero card: the game's hero image when
   GetItems has `library_hero`, else the header, with title, reason, meta and
   the actions), then **Recommended for you** (results 2–13, See all → For
   you), then **Because you played X** for the top two seeds (their "More like
   this" list re-ranked by `relevance`, See all → For you with Picked games =
   that seed). Signed out with an empty library, this group is replaced by a
   short explanation and a link to the library import options (Steam
   history, Heroic and Lutris, folders).
2. **Popular now**: **Most played today** (top 12, See all → Charts on that
   chart) and **Trending**.
3. **New**: **New releases on your sources** (as today, See all → Browse
   sorted by newest with your sources selected), **New on AnkerGames** and
   **Trending on AnkerGames** (as today; no See all).
4. **Explore**: the discovery queue (from For you's results 14+, then
   trending, then new releases); **Hidden gems** (90 % and up, 50–5,000
   reviews, ranked by `relevance`, See all → For you with Niche and those
   filters); **Finished and polished** (`isFinishedGame` and 85 % and up, See
   all → For you with Finished only); **Browse by tag** chips with counts
   from step 3 (one click → Browse with the tag).

**Featured** (Hydra's Hot now list) moves to the Popular group, after
Trending. Every shelf respects Hide my games, Not interested and Avoid tags,
except AnkerGames'. Each shelf loads on its own; one slow source never holds
up the page. Keep the half-hour shelf cache in `catalogue-front-page.tsx` for
the shelves that use it.

### Step 9. Home page on the same recommender and card

`pages/home/use-home-suggestions.ts` calls `getRecommendations` with the
saved Tune settings and shows the top 12 with their reason, as
`StoreGameCard size="shelf"` inside the home's shelf. The old ranking
(`getSuggestionSeeds`, `rankSuggestions`) goes when nothing else uses it;
check first with a search. Update [Home](features/home.md#suggested-for-you):
it now describes the recommender and links to the catalogue doc.

### Step 10. Docs

Rewrite [Catalogue](features/catalogue.md) around the three tabs: Discover,
For you and Tune (with the scoring explained in prose, the idle rule and what
Avoid tags does), Charts (each chart's source and its limits: no playtime
from SteamSpy, snapshots for 30 and 90 days, DLC not counted in Finished),
Browse and its filter counts. Update the patterns table in
`features/game-page.md`. Move phase 20 into the done list in the roadmap.
Each earlier step already updates the docs for what it shipped.

## Checking

Every step: `npm run typecheck` (TS7056 on `src/locales/index.ts` is known),
`npm run lint`, and `npm test` for the shared tests. Then a sandboxed dev
instance (CLAUDE.md → Dev testing), signed out, **with no seeded database**,
at 1280×800 and at 1920×1080, driven with `scripts/dev/cdp.mjs` (screenshot
and evaluate). Look at:

- **Step 1**: Discover's shelves, Browse in list and grid: one card design;
  no white skeletons; no shelf scrollbars; whole cards only; review %, year
  and tags fill in after a moment; hover shows actions and previews; Tab
  reaches the actions.
- **Step 2**: a header search from the home page lands on Browse; a tag on a
  game page lands on Browse; switching tabs keeps each tab's scroll; Hide my
  games hides owned games on Discover (except AnkerGames) and Browse.
- **Step 3**: Tags and Genres ordered by count with grey counts; no software
  genres; developers are a search field; under 1100 px the sidebar is a
  drawer. Watch the main log for the counts job: about 500 requests once,
  none on the second open the same day.
- **Step 5**: each chart loads; movement arrows on Most played today;
  Singleplayer has no Rainbow Six Siege, Helldivers 2 or Wallpaper Engine;
  30 days shows the collecting notice on a fresh sandbox; turning the network
  off shows the reason, not a blank table.
- **Steps 6–7**: seed a sandbox library (copy of `hydra-db` with the
  `auth`/`user` keys deleted and `scanLibraryOnStartup` off, per CLAUDE.md)
  that has Clicker Heroes as the most played game. With defaults, For you
  shows no idle games and the profile notes the 10 % rule. Avoiding Idler
  removes them even with the idle rule off. Changing a slider re-ranks
  without a refetch (main log). A preset survives a restart. Not interested
  hides a game from For you and Discover, and Undo brings it back.
- **Step 8**: the four groups in order; each See all lands on the right tab
  with the right state; an empty signed-out library shows the explanation
  instead of For you.
- **Modest machine** (Principles): at 1280×800, Discover scrolls smoothly
  with every shelf loaded (no layout jumps when facts arrive: reserve the
  meta line's height).

## Where things are today

- Page: `src/renderer/src/pages/catalogue/catalogue.tsx` (1,215 lines:
  filters, search, load more, header), `catalogue-front-page.tsx` (shelves,
  queue, tags), `game-item.tsx` (rows and grid cards), `filter-section.tsx`
  (filter lists, `rc-virtual-list`), `catalogue-results-cache.ts` (kept
  results and scroll), `catalogue-library-state.ts`.
- Row data: `src/main/services/catalogue-row-details.ts` (Steam store details
  via Hydra, How Long to Beat, download sizes; one hour) and
  `src/main/services/steam-tags.ts` (`GetItems` tags; six hours).
- Similar games and the current suggestions: `src/main/services/steam-similar.ts`
  (Steam's "More like this" page plus `GetItems`), `src/shared/similar-games.ts`
  (`rankSimilarGames`, cosine over vote-weighted tags with IDF),
  `src/renderer/src/pages/home/use-home-suggestions.ts` and `home-sections.ts`
  (`getSuggestionSeeds`, `rankSuggestions`).
- Steam reception (reviews, players, Metacritic) for the game page:
  `src/main/services/steam-reception.ts`.
- IPC: `src/main/events/catalogue/*.ts` with `registerEvent`, listed in
  `src/main/events/catalogue/index.ts`; the preload in `src/preload/index.ts`;
  the renderer's `window.electron` types next to it.
- Sublevels: `src/main/level/sublevels/` with keys in `keys.ts` (pattern:
  `local-collections.ts`).
- Tests: `npm test` runs `node --test` over `src/**/*.test.ts`.

## Open questions

None blocking. Decide while implementing, and note the decision in the
feature doc:

- Whether the counts job also counts developers and publishers for the
  **From your library** suggestions (five or ten requests, cheap).
- Whether **Not interested** should sync between devices through library
  sync ([Save sync](features/save-sync.md#library-sync)); not in this phase.
