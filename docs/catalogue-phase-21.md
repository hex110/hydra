# Catalogue, phase 21: spec and plan

Written 2026-11-03 with the owner, after using what phase 20 shipped. This is
the document to start from when implementing roadmap phase 21 (**Catalogue:
groups, one rating, cache first**). It says what to change, in which order,
what the owner decided, what was checked, and how to check each step. Steps
are written to be implemented one at a time by an agent that has not seen the
conversation they came from; files, functions and endpoints named here were
checked on 2026-11-03.

- What exists: [Catalogue, phase 20](catalogue-phase-20.md) (its "As built"
  notes are the current state), [Catalogue](features/catalogue.md) and the
  patterns in [Game page → Patterns across pages](features/game-page.md#patterns-across-pages).
- The rules every step follows: `CLAUDE.md` (worktrees, UI consistency, i18n,
  logger) and the [Principles](roadmap.md#principles).

## Goal

Phase 20 built the three tabs and a recommender. Using them showed:

- **Charts** mixes two ideas: what a list _is_ (players, reviews, releases)
  and _which games_ it covers (a period). Top releases offers three months,
  and Best rated is in an order nobody can explain.
- **For you** averages the whole library into one taste, so every game in
  **Based on** holds 1–2 %, only ten of them are shown, and the results suit
  no part of the library in particular. Common tags (Military, War) outweigh
  the rare one that defines a game (Flight).
- **Discover** hides the recommender behind **See all**, and "Because you
  played X" rows recommend from one game.
- Every list shows a different "rating", and every visit starts from blank.

After phase 21:

- The recommender learns **groups** of taste from the library (Nodal's
  "FPS / Team-Based / Competitive · 101 games · 2,668 h"), recommends for one
  group at a time or all of them mixed, and weighs tags by how rare they are
  in the whole catalogue.
- One **Hydra rating** (Steam reviews adjusted for how many there are, with
  Metacritic when known) is used by every sort, chip and chart.
- Charts are **metrics** (what to rank by); the release period and the rest
  are **filters**.
- Discover opens on the recommender; every surface shows what it knew last
  time at once and refreshes in place.

## Owner decisions (2026-11-03)

1. **Charts**: the picker chooses what the chart ranks by. The release
   period (month and year, a whole year, the last _n_ months) is a filter,
   shared by every chart.
2. **Best rated** uses a rating that says what it is made of, with Steam
   reviews, critic scores and the number of each.
3. **Discover** starts with a large section that leads into the recommender;
   the other rows follow. No "Because you played X" rows.
4. **No idle checkbox.** Idler, Incremental and Clicker start in the shared
   avoid list as removable defaults.
5. **Based on** shows every game it uses, not ten.
6. **Recommend from groups of games and tags**, not from single games
   (Nodal is the reference the owner liked best).
7. **For you opens on one group at a time**, with an option to mix all
   groups.
8. **Rare tags count more**: a game whose first tag is Flight should be
   matched by games with Flight near the top, not by Call of Duty on Military
   and War.
9. **How niche a game is** belongs in recommendations (the Popular ↔ Niche
   slider), not in the rating.
10. **Cache first**: open with what was known before, show a loading icon
    where data is still coming in.

## What was wrong (checked 2026-11-03)

| What                                 | Why                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Top releases has three months        | `ISteamChartsService/GetTopReleasesPages/v1` returns three pages, and they are **Feb 2025, Jan 2025, Dec 2024**: Steam stopped updating it. The recommender's "top releases of the last 12 months" candidates (`buildPool` in `src/main/services/recommender.ts`) come from the same stale list.                               |
| Best rated in a random-looking order | `searchBestRated` (`src/main/services/catalogue-charts.ts`) sorts by Hydra's `hydraScore`, which is not a rating: for 2026 it puts Resident Evil Requiem, 007 First Light and Call of Duty first. The table then shows Steam's percentage, which played no part in the order. Browse's "Highest rated" sort has the same flaw. |
| Based on at 1–2 %                    | `buildTasteProfile` (`src/shared/recommender/profile.ts`) gives ~460 played games `log2(1 + hours)` each and sums them into one vector, so no game holds much. The panel shows `SEEDS_SHOWN` (10).                                                                                                                             |
| Rare tags don't win                  | `buildIdf` (`src/shared/recommender/vector.ts`) measures rarity over the _candidate pool_, which was retrieved by the person's own top tags, so inside it Military looks rare. The whole-catalogue counts per tag already exist (`catalogueFacetCounts`, phase 20 step 3) and are not used.                                    |
| Everything reloads                   | Discover's shelves (30 min), Charts (5 min) and the recommender pool (6 h) are cached in memory only. Steam store items (7 days), facet counts and steamcharts.com are the only things on disk.                                                                                                                                |

## Data sources (checked 2026-11-03)

New or newly understood since phase 20; the phase 20 table still holds.

| Source                                                                        | Request                                                                                                                                                                                                           | What it gives                                                                                                                                                                                                              | Used for                                                           |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Steam store search `store.steampowered.com/search/results/?infinite=1&json=1` | `tags=<id,id>` (all of), **`untags=<id,id>`** (none of), `sort_by=Reviews_DESC` / `Released_DESC` / `_ASC`, `category3=2` (single-player) etc., `os=linux`, `deck_compatibility=3`, `hidef2p=1`, `start`, `count` | `total_count`, `results_html` (rows with `data-ds-appid`; parse like steamcharts.com's HTML). No key. Roguelike: 6,350; with Roguelite excluded: 2,029. `filter=popularcomingsoon` lists the most-followed upcoming games. | Browse with Avoid tags or rating sort; Upcoming; cluster retrieval |
| Hydra catalogue search                                                        | `take` at most **100**; `sortBy` one of `popularity`, `reviewScore`, `alphabetical`, `hydraScore`, `releaseDate`                                                                                                  | No rating sort and no tag exclusion. `releaseYear` follows Steam's `steam_release_date`, so a game that left Early Access in 2026 is a 2026 game (Valheim).                                                                | Period candidates (most reviewed in a year)                        |
| Hydra `POST /games/shop-details`                                              | `{ shop: "steam", objectIds, language }`, up to 60 ids (as `catalogue-row-details.ts` uses it)                                                                                                                    | Steam's app details per game, including `metacritic.score`                                                                                                                                                                 | Critic part of the Hydra rating, in bulk                           |
| Steam `GetItems` `release`                                                    | already requested                                                                                                                                                                                                 | `steam_release_date`, `original_steam_release_date` (first Early Access day), `release_from_early_access_date`                                                                                                             | Exact release month for the period filter; "1.0" marker            |
| `catalogueFacetCounts` sublevel                                               | already stored daily                                                                                                                                                                                              | Games per tag over the whole catalogue                                                                                                                                                                                     | Catalogue-wide tag rarity                                          |

Still not available: OpenCritic's API now needs a RapidAPI key, so critic
scores come from Metacritic through Steam only. A per-user "people who played
X also played Y" signal at Nodal's scale needs data we don't have; Steam's
"More like this" lists remain our behaviour signal.

## What other recommenders and stores do

The owner asked what other platforms, launchers and other media do, for the
recommender and for charts and browsing. What we take from each, and the
step it lands in:

**Recommenders**

- **Nodal** (games): clusters of the library named by three tags, with games
  and hours per cluster and the games listed when opened; By Game, By
  Multi-Game, By Tag and Blend modes; ranking sliders that don't change
  similarity. → steps 5–6 (groups, modes), step 9 (Blend, later).
- **Spotify**: _Daylist_ and the genre mixes are one mix per taste group with
  a generated name, the same idea as Nodal's clusters; _Discover Weekly_ is
  stable for a week and new the next; "Exclude from your taste profile" per
  playlist; _Blend_ mixes two people's tastes. → steps 5–7 (groups, weekly
  freshness, exclude per game).
- **Netflix**: rows per taste, not one ranked list; an item seen many times
  and never opened sinks (impression discounting); thumbs up and down feed
  back at once. → steps 6–7 (seen-and-skipped decay, feedback).
- **YouTube**: "Not interested" asks _why_ ("I don't like this video", "Don't
  recommend channel"), and each answer teaches something different. → step 7
  (Not interested with a reason).
- **Amazon / Kindle "Improve your recommendations"**: lists every item used,
  each with "Don't use for recommendations", and lets you rate items bought
  elsewhere. → step 6 (all games listed), step 7 (Played elsewhere).
- **Letterboxd / Backloggd / StoryGraph**: logging what you played outside
  the app; StoryGraph's _mood_ and _pace_ questions in front of the filters.
  → step 7 (Played elsewhere, quick moods).
- **Steam's Interactive Recommender**: popularity and recency sliders, tag
  include and exclude. Already in Tune.
- **TikTok, Spotify's "discovery" setting**: a deliberate share of
  adventurous picks so the profile doesn't narrow. → step 8 (Outside your
  usual).

**Charts**

- **SteamDB**: one rating formula that accounts for review count, shown
  everywhere with its parts; sortable columns; a tooltip on the rating that
  explains it. → steps 1, 3.
- **Steam 250**: lists by year and by tag, Hidden gems by adjusted rating.
  → step 3 (period and tag filters on every chart).
- **AniList / MyAnimeList**: season and year pickers on top of every chart,
  the heading says what you are looking at ("Top rated, 2026"). → step 3.
- **Billboard / Spotify charts**: movement, _new_, peak position and time on
  the chart. → step 3 (days on chart from our snapshots).
- **App stores**: an "Upcoming / Most anticipated" chart next to the
  released ones. → step 3.

**Browse**

- **Steam's store search**: include _and_ exclude tags, players, Steam Deck,
  sort by user reviews. → step 4.
- **itch.io / Steam tags**: a tag chip that cycles include → exclude → off.
  → step 4.
- **Letterboxd**: browse by decade, "Highest rated" that needs a minimum
  number of ratings, "Hide watched". → step 4 (decade chips; Hide my games
  exists).
- **GOG**: active filters as chips with one Clear all (exists), and saved
  searches. → step 4.

## Work, in order

Each step lands on its own in its own worktree, with its docs updated, and
is checked as described under [Checking](#checking).

### Step 1. One Hydra rating

Pure, in `src/shared/store-rating.ts`, tested:

```ts
export interface StoreRating {
  value: number; // 0–100, what every sort and chip uses
  steam: number | null; // adjusted Steam part, 0–100
  critic: number | null; // Metacritic as given
  reviewCount: number;
  reviewPercent: number | null;
}
export const getStoreRating = (input: {
  reviewPercent: number | null;
  reviewCount: number | null;
  criticScore: number | null;
}): StoreRating | null;
```

- **Steam part**, SteamDB's formula: `p − (p − 0.5) × 2^(−log10(n + 1))`,
  with `p` the positive share (0–1) and `n` the review count. With few
  reviews a score is pulled toward 50 %; at 60,000 reviews it barely moves.
  It needs no catalogue average and is easy to explain. `null` under 10
  reviews (Steam shows no score then).
- **Critic part**: Metacritic when known. Blend as
  `(wₛ·steam + w_c·critic) / (wₛ + w_c)` with `wₛ = 1 − 2^(−log10(n + 1))`
  (how sure the Steam part is) and `w_c = 0.35`, so critics matter most where
  players have said little.
- `null` when neither part exists.

**Critic scores in bulk**: `src/main/services/critic-scores.ts`,
`getCriticScores(appIds)` through `/games/shop-details` in batches of 60,
cached in a sublevel (`criticScores`) for 30 days (they barely change); a
game without one is cached as `null` too. `catalogue-row-details.ts` and
`steam-reception.ts` read from it instead of keeping their own copy.

**Shown**: the review chip on `StoreGameMeta` (`components/store-game-meta/`)
shows the Hydra rating, toned by `getReviewTone` on `value`; its tooltip
gives the parts ("Hydra rating 91 · Steam 96 % of 62,210 reviews ·
Metacritic 88 · How this is worked out"). The last part links to the
catalogue doc's explanation (in-app: a small popover with the two formulas in
words). The Metacritic chip goes from the card (it is now part of the
rating); the game page keeps its own reception section, which is the one home
for the separate figures (add the Hydra rating to the ownership table in
`docs/features/game-page.md`, row "Rating").

**Used by**: the recommender's `quality` (replaces `wilsonLowerBound` there;
keep the function for its tests or remove it if unused), Charts' rating
column and sort, Browse's "Best rated" (step 4), Hidden gems.

**As built (step 1).** As specified. `getRatingQuality` replaces
`wilsonLowerBound`, which is gone. Metacritic comes from `getCriticScores`
(`critic-scores.ts`); `catalogue-row-details.ts` feeds the same cache.
`steam-reception.ts` still fetches its own. The card's chip is a star and the
rating; there is no explanation popover, the tooltip carries the parts and a
sentence on how they are combined.

### Step 2. Cache first

A main-process store, `src/main/services/catalogue-snapshots.ts`, over a new
sublevel `catalogueSnapshots`: `get(key)` and `set(key, data)` with
`{ at, data }`, entries kept 30 days, at most 40 keys (oldest dropped).

- **Keys**: `discover:<sourcesKey>` (each shelf's games), `chart:<id>:<hash
of filters that change the request>`, `recommendations:<hash of options>`,
  `home-suggestions`, `facets` (already on disk; leave it).
- Every IPC that returns one of these gains a cached twin or a flag, e.g.
  `getCatalogueChart(request, { cachedOnly: true })`, so the renderer asks
  for the snapshot first (answers in milliseconds), renders it, then asks for
  fresh data. The fresh answer replaces the snapshot and is stored.
- The recommender's **pool** is also stored (key `pool:<pool key>`, 6 hours),
  so a restart within six hours re-ranks without the ~30 requests.
- **UI**: a section showing a snapshot shows its normal content plus the
  refreshing icon `StoreShelf` already has (`isRefreshing`); Charts and For
  you show it in their header. No skeletons when a snapshot exists. When the
  fresh request fails, keep the snapshot and say so in the icon's tooltip
  ("Showing what Hydra had 3 hours ago; Steam could not be reached").
- **No layout jumps**: a refreshed list replaces the old one in one render;
  the scroll position is kept (`catalogue-tab-scroll.ts`).
- Renderer: one hook, `useCachedCatalogueData(key, load)` in
  `pages/catalogue/`, returns `{ data, isRefreshing, updatedAt, failed }`,
  used by Discover, Charts, For you and the home suggestions.

**As built (step 2).** No `cachedOnly` flags: two IPC calls,
`getCatalogueSnapshot` and `setCatalogueSnapshot`, and the renderer reads the
snapshot itself (`catalogue-snapshots.ts`, used by `useRecommendations`,
Charts and Discover's shelves and charts). There is no
`useCachedCatalogueData` hook. For you dims a snapshot while it refreshes, as
it does after a Tune change.

### Step 3. Charts: metrics and filters

**Picker** (right column, one radio list), what the chart ranks by:

1. **Playing now** (players now), 2. **Most played today** (daily peak,
   movement), 3. **Trending** (places gained), 4. **Most played, 30 days**
   and 5. **90 days** (steamcharts.com, snapshots as fallback), 6. **Best
   rated** (Hydra rating), 7. **Most reviewed** (review count), 8. **Most
   anticipated** (Steam store search `filter=popularcomingsoon`, upcoming
   only; the period filter doesn't apply and is hidden).

"Most played singleplayer" stops being a chart: **Singleplayer only** is
already a chart filter and applies to every chart. "Top releases" stops
being a chart: it is **Best rated** or **Most reviewed** with a period.

**Filters** (under the picker), in this order:

- **Released**: Any time · Last 30 days · Last 3 months · Last 12 months ·
  This year · A year (year picker) · A month (month and year pickers).
  Uses the store item's `releaseDate` (`steam_release_date`, so leaving
  Early Access counts as a release; such rows get a muted "1.0" chip). A
  `SegmentedControl` for the presets plus the pickers when chosen.
- Tags, Avoid tags, ProtonDB minimum, Singleplayer only, Hide Early Access,
  Free to play (as today), and **Minimum reviews** (default 500 on Best
  rated, hidden elsewhere).

**Candidates per metric**, in `catalogue-charts.ts`:

- Player metrics: the same lists as today, filtered by the period
  client-side. A narrow period empties a top-100 player list fast; when fewer
  than 10 rows remain, the empty state says so and offers **Best rated in
  this period** instead.
- **Best rated** and **Most reviewed**: Hydra search `sortBy: "reviewScore"`
  (most reviewed) with `releaseYear` covering the period, 5 pages of 100
  (500 games), plus Steam store search `sort_by=Reviews_DESC` with the
  chart's tags and `untags` (the avoid list) for 3 pages; enriched with
  `getStoreItems` and `getCriticScores`, cut to the exact period by
  `releaseDate`, ranked by `StoreRating.value` (or review count), top 100.
  The table heading says what it shows: "Best rated · released in March 2026
  · 500+ reviews".
- Remove `searchBestRated` and the top-releases chart; replace the
  recommender's top-releases candidates with "Most reviewed, last 12 months"
  from the same function.

**Table** (`StoreGameTable`): the rating column is the Hydra rating with the
step 1 tooltip. A **Days in top 100** column on Most played and Trending
from `chart-snapshots.ts` (Billboard's weeks on chart; shown once 7 days are
recorded). After filtering, rank shows the row's place in the filtered list,
with the chart's own rank in the tooltip ("#14 on Steam's list").

**Remember**: the chosen chart and its filters persist (localStorage is
enough; the avoid list stays shared).

**As built (step 3).** As specified, with `STORE_RANKED_CHARTS` (Best rated,
Most reviewed) fetching by period through `getStoreRankedCandidates`, which the
recommender also uses for its recent-releases candidates. SteamSpy and its
service are gone. Stored item data now carries `leftEarlyAccessAt`,
`isComingSoon` and `releasePrecision`.

### Step 4. Browse

- **Two backends, one page.** Hydra search stays the default (it is the only
  one that knows download sources and ProtonDB). Browse switches to Steam's
  store search when the request needs what only Steam has: **Avoid tags**
  (exclude), **Best rated** sort, or the **Players** filter, _and_ no
  download-source filter is set. A muted line under the count says "Results
  from Steam's store search" with a tooltip saying why. Both return Steam app
  ids; cards fill in the same way. If both are needed (sources and exclude),
  Hydra search runs and avoided games are hidden from the loaded pages, and
  the count says "about".
- **Sort**: Popularity, **Best rated** (new, Steam's `Reviews_DESC`, then
  each page re-ordered by Hydra rating), Most reviewed, Newest, Oldest, Title
  A–Z, Z–A. Today's "Highest rated" (`hydraScore`) is renamed **Popular on
  Hydra**, which is what it measures.
- **Tags** in the sidebar cycle include → exclude → off on click (itch.io,
  Steam). Excluded tags show as struck-through chips in the active filters
  and are the same thing as a one-off Avoid tag; **Avoid tags** from the
  shared list apply too, with a toggle "Use my avoid list" (on).
- **Players** (new section, Steam backend): Singleplayer, Co-op, Online PvP,
  Local multiplayer (Steam categories 2, 9, 36/49, 24).
- **Released**: decade chips (2020s, 2010s, 2000s, older) above the
  existing slider.
- **Saved searches**: "Save this search" in the toolbar stores the filters
  and sort under a name; the saved ones are a menu next to it. Stored with
  the Tune presets in `catalogueTaste` (a `browsePresets` field).

**As built (step 4).** Excluded tags are a section of their own (a tag search
with chips), not a three-state click on the Tags list, and the avoid list is
off by default in Browse ("Also leave out my avoid list"). Saved searches are
a sidebar section. Category 24 (shared/split screen) stands for local
multiplayer.

### Step 5. The recommender in groups

Pure functions in `src/shared/recommender/` (tested), orchestration in
`src/main/services/recommender.ts`.

**Tag rarity from the catalogue.** `buildCatalogueIdf(counts, total)` in
`vector.ts`: `idf(t) = log(total / (1 + count_t))`, `total` the catalogue
size (the facet-count job also stores the count of an unfiltered search).
`rankCandidates` and grouping use it; `buildIdf` over the pool remains the
fallback before the first count run. Feature tags stay excluded
(`FEATURE_TAG_IDS`).

**Groups.** `groupSeeds(seeds, idf, options)` in `groups.ts`:

- Each positive seed's vector: `tagVector(seed.tags)` scaled by the
  catalogue IDF, unit length.
- **Weighted spherical k-means**, deterministic: `k =
clamp(round(sqrt(n / 12)), 1, 8)` for _n_ positive seeds (460 games → 6,
  as Nodal showed the owner; 30 → 2). Start from the heaviest seed, then
  repeatedly the seed with the largest `weight × (1 − best cosine to a
chosen centre)`. At most 25 iterations. Groups holding under 4 % of the
  weight merge into their nearest group.
- **Centroid** per group: the weighted mean of its seeds' vectors, unit
  length. Negative seeds (dropped, rated low) subtract from the group they
  are closest to.
- **Name**: the three tags with the highest **lift**, `share of the group's
tag mass × idf`, skipping a tag whose family member is already in the name.
  "Difficult / Fast-Paced / Platformer".
- **Anchors**: those three tags; the group's identity.
- Returned per group: `id` (hash of its anchor ids, stable across runs while
  the library is similar), `name` tag ids, `games` (every seed, with hours,
  share _within the group_ and notes), `hours`, `share` of all weight.

**Anchor rule** (the owner's Flight example). A candidate fits a group only
if one of the group's anchors (with its family) is among the candidate's
first 5 tags. For **By game** (one or a few picked games, step 6) the
anchors are the seed's first-3 tags whose catalogue IDF is above the median
of its tags, and the rarest of them must be among the candidate's first 5.
Ace Combat 7 (Flight, Military, War…): Flight is the anchor; Squad and Call
of Duty lack it and drop out. Add a position bonus: `+ 0.1 × idf(anchor) /
max idf × (1 − position / 5)`.

**Retrieval per group** (union, then cached as the pool): Steam's "More like
this" for the group's three heaviest games; Hydra search for each anchor
(`hydraScore` and `popularity`, as today); Steam store search with
`tags=<first two anchors>`, `sort_by=Reviews_DESC`, 2 pages, and `untags` =
the avoid list. About 12 requests a group; groups are fetched in sequence,
the shown group first.

**Scoring per group**: `similarity` = cosine of the group centroid and the
candidate (catalogue IDF); `behaviour` as today, from the group's own
games; `quality` = Hydra rating / 100. `relevance = 0.55 similarity + 0.25
behaviour + 0.2 quality`, then the anchor bonus, then the sliders as today.
Hard filters and diversity as today, with "per seed" becoming "per game in
the group".

**Mix all**: interleave the groups' ranked lists by largest remainder of
their `share`, skipping games already picked, then the diversity pass over
the result. A result's reason names its group.

**Freshness** (Spotify's weekly mix): within each list, games whose scores
are within 2 % of each other are ordered by a hash of `appId + ISO week`, so
For you is stable for a week and moves the next. **Seen and skipped**
(Netflix): the renderer records impressions (a card visible for a second)
in a sublevel `catalogueImpressions` (`appId → { count, lastAt, opened }`);
from the fourth impression without opening the game, its score is multiplied
by `0.95^(count − 3)`, floor 0.7. Opening the game page resets it.

**Idle rule out, avoid list in.** Remove `idleDiscount` from `TuneOptions`
and the idle-specific code in `profile.ts` and `scoring.ts`; the avoid rule
already excludes seeds and candidates with an avoided tag. `DEFAULT_TUNE_OPTIONS.avoidTags`
becomes the idle family (`IDLE_TAG_IDS`). **Migration** in `getTuneSettings`:
a stored record without a `version` gets the idle tags added to its avoid
list once (if `idleDiscount` was on, the default) and `version: 2`; a user
who removes them later keeps them removed. `dominantFamily` and its "Avoid
it?" prompt stay; they now catch what the defaults don't.

**Response**: `{ groups: ProfileGroup[], group: string | "all", results,
leftOut, … }` replaces `profile.seeds`; `because` goes (step 8 removes its
rows). `getLibraryFacets` takes its tags from the groups' names.

**Tests**: a fixture library of shooters, management sims and precision
platformers forms three groups with sensible names; Clicker Heroes with the
default avoid list is in none; Ace Combat 7 as the picked game ranks a
Flight game above a Military/War FPS that matches more tags; catalogue IDF
ranks Flight above Military; Mix all keeps the shares within one game per
group; the weekly order is stable within a week and changes across weeks;
the migration adds idle tags once.

**As built (step 5).** As specified. Checked on the owner's library
(2026-11-03): seven groups (Open World / Story Rich / Atmospheric, FPS /
Shooter / First-Person, Open World Survival Craft / Sandbox / Survival,
Difficult / Platformer / Metroidvania, Action Roguelike / Dungeon Crawler /
Hack and Slash, Roguelike Deckbuilder / Deckbuilding / Card Game, Co-op /
Funny / Comedy); Ace Combat 8 in Games mode gives flight games only. Before
the first facet count has the catalogue size, rarity is measured within the
library. Impressions are counted once per game per run of Hydra, a second
after the list shows.

### Step 6. For you, rebuilt around groups

**Layout**: results on the left; on the right, **Based on** at the top, then
Tune as today.

**Based on**, modes as a `SegmentedControl`:

- **Groups** (default): a list of the groups as rows, "Difficult /
  Fast-Paced / Platformer · 173 games · 793 h", the chosen one highlighted;
  **Mix all** as the first row. Choosing one re-ranks (no refetch once its
  part of the pool is in). Each row has **Details** that expands its **full
  game list** (virtualised; hours, share within the group, notes such as
  "rated 9", "finished", "dropped"), each game with ✕ (exclude, Spotify's
  "Exclude from your taste profile"). A header line above the list: "463
  games · 19 without Steam tags not used" (Nodal's "games not shown").
- **Games**: pick one or more games, from the library _or the whole
  catalogue_ (Nodal's By Game and By Multi-Game); a game page gets a
  **More like this** link that opens For you in this mode with that game.
  The anchor rule of step 5 applies.
- **Tags**: start from chosen tags only (Nodal's By Tag): the group is
  made of those tags, no library games.
- **Recent**: the last 90 days' play, grouped the same way.

The last chosen mode and group persist in the Tune settings.

**As built (step 6).** As specified; the mode labels are Groups, Last 90
days, Games and Tags.

### Step 7. Feedback from the cards

- **Not interested, with a reason** (YouTube): the ✕ opens a small menu:
  _Not this game_ (as today) · _Not this kind_ (offers to add the game's
  rarest first-3 tag to the avoid list, naming it) · _Already played_
  (below). The Undo bar stays.
- **Already played** (Letterboxd, Kindle): marks a game as played outside
  Hydra with an optional rating (the `Rating` primitive from the game page).
  Stored in `catalogueTaste.playedElsewhere` (`appId → { rating, at }`),
  used as a seed (weight as 10 hours, then the rating factor) and hidden from
  results like owned games. Listed and removable in Based on → Details under
  "Played elsewhere".
- **More like this** on a card's hover actions: opens For you in Games mode
  with that game.
- **Wishlisting** a suggestion already counts as intent (0.3); say so in
  the wishlist button's tooltip on suggestions.
- **Moods** (StoryGraph, Spotify's mood mixes): built-in presets above the
  saved ones in Presets: _Something short_ (under 5 h), _A long one_ (over
  40 h), _Hidden gems_ (niche, 90 %+, 50–5,000 reviews), _Finished and
  polished_, _New this year_, _Co-op night_ (leans toward Co-op family).
  They set filters only; Based on stays.

**As built (step 7).** As specified, except the wishlist tooltip on
suggestions, which was not added. Moods turn off again when clicked.

### Step 8. Discover

Top to bottom:

1. **Recommender hero** (full width, the owner's "big button"): the heading
   "Recommended for you", one line of what it is built from ("From 463
   games in 6 groups"), the groups as chips (each opens For you on that
   group), the top pick as a large card (header image, title, reason, rating,
   actions), and **Open recommendations** as the primary button. Signed out
   with an empty library: the explanation and the import links (as today).
2. **Your groups**: one shelf per group, up to three, largest first, each
   titled with the group's name and See all → For you on it. These replace
   "Recommended for you" and "Because you played".
3. **Popular now**: Most played today, Trending, Featured (as today).
4. **New**: New releases on your sources, Most anticipated (step 3),
   New and Trending on AnkerGames (as today).
5. **Explore**: Hidden gems, Finished and polished, **Outside your usual**
   (TikTok's adventurous share: the best-rated games of the catalogue's 20
   most common tags that are _not_ among any group's top tags, avoid list
   applied, one shelf), the discovery queue, Browse by tag with the counts
   step 3 of phase 20 added.

Every shelf uses step 2's snapshots and keeps the rules of phase 20 (Hide my
games, Not interested and Avoid tags everywhere but AnkerGames).

**As built (step 8).** As specified. Group shelves show no reason line, since
the shelf title names the group. Outside your usual uses Tags mode with four
of the 20 most common catalogue tags and a review floor of 85 %.

### Step 9. Later, not in this phase's checklist

- **Blend with a friend** (Spotify, Nodal): groups from two libraries,
  results liked by both. Needs a friend's library with playtime through
  Hydra's profile API; check what it returns, and that it works only for
  friends whose library is public.
- **Your taste** page (Nodal's profile, Last.fm's stats): groups over time,
  popular vs niche share, playtime by release year. Fun, not needed for
  better results.

### Step 10. Docs

Rewrite the For you, Charts and Browse parts of
[Catalogue](features/catalogue.md): groups and the anchor rule in prose, the
Hydra rating's formula, the two Browse backends and when each is used, cache
first. Update [Home](features/home.md#suggested-for-you), the patterns and
ownership tables in `features/game-page.md`, and move phase 21 to done in the
roadmap. Each step already updates the docs for what it shipped.

## Checking

Every step: `npm run typecheck` (TS7056 on `src/locales/index.ts` is known),
`npm run lint`, `npm test`. Then a sandboxed dev instance (CLAUDE.md → Dev
testing), signed out, at 1280×800 and 1920×1080, driven with
`scripts/dev/cdp.mjs`. Look at:

- **Step 1**: a 40-review 100 % game rates below a 60,000-review 96 % one;
  the tooltip lists the parts; no Metacritic chip on cards.
- **Step 2**: open the catalogue, quit, reopen: Discover, the last chart and
  For you show at once with the refreshing icon, then update without a jump.
  With the network off, the snapshot stays and the tooltip says why.
- **Step 3**: Best rated · a month of 2026 lists 2026 games ordered by the
  rating column; Most played with "Last 30 days" says when it is nearly
  empty; Most anticipated lists unreleased games; nothing from Feb 2025
  appears as new.
- **Step 4**: Roguelike with Roguelite excluded shows ~2,000 games and the
  "Steam's store search" line; adding a download source switches back to
  Hydra search with "about"; Popular on Hydra is the old order.
- **Steps 5–6**: with a copy of the owner's library (per CLAUDE.md: `auth`
  and `user` keys deleted, `scanLibraryOnStartup` off), For you shows about
  six named groups, each listing all its games with real shares; no idle
  game anywhere with defaults; Ace Combat 7 in Games mode gives flight games,
  not Squad or Call of Duty; switching group re-ranks without a refetch
  (main log).
- **Step 7**: _Not this kind_ adds the named tag to the avoid list; an
  _Already played_ game leaves the results and appears under Played
  elsewhere.
- **Step 8**: Discover opens on the hero; no "Because you played" rows; a
  group chip lands on For you with that group.
- **Modest machine**: Discover with every shelf from snapshots scrolls
  smoothly at 1280×800; grouping 400 games takes under 100 ms (log it).

## Open questions

None blocking. Decide while implementing and note the decision in the
feature doc:

- Whether a seed may belong to two groups (soft membership) when it sits
  between them. Start with one group per game.
- Whether Steam's store search answers the same from every country; it
  takes `cc`, and Hydra Plus should pass the user's store country if Hydra
  knows it.
