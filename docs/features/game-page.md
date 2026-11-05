# Game page and interface

## Where things live

Each fact on the game page has one home. Anything else that mentions it is a
summary that links there. Add a row here when a feature adds a new fact.

| Fact                                                     | Lives in                                                                                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Playtime, last played, launch state, update chip         | Hero bar                                                                                                                                                                          |
| Play status, rating, favourite, pin, wishlist, notes     | **Your game** sidebar section                                                                                                                                                     |
| Installed mods, their order and updates                  | **Mods** page; the **Mods** sidebar section summarises and links to it                                                                                                            |
| What Hydra knows about modding a game, its loader        | **Mods** page: the line under **Installed mods**, the loader's row (**Loader**) and the "is needed" row                                                                           |
| Mods waiting for a placement, and where a mod's files go | **Mods** page: the waiting row and its placement dialog; **Change where it goes** on an installed row                                                                             |
| What happened to a game's mods (activity log, report)    | **Mods** page → **Activity**; Copy mods report there and on a failed modded run                                                                                                   |
| Play or Play (modded), the default per game              | Hero bar's split Play button; the context menu and Big Picture follow it                                                                                                          |
| Mod downloads and their state                            | **Downloads** page → **Mod downloads**; the Mods page shows this game's with a link there                                                                                         |
| A run's mods (modded or not, loader, mods on)            | **Options → Compatibility**, the Runs part                                                                                                                                        |
| Copies and other versions in your library                | **Your game** sidebar section, only when there are any                                                                                                                            |
| Achievements                                             | Sidebar summary (icon, name, description), details on the achievements page                                                                                                       |
| System requirements, supported languages                 | Middle column, below **About this game** and above **More like this**                                                                                                             |
| Outside ratings and player counts                        | **Reception** sidebar section (Steam games)                                                                                                                                       |
| Hydra rating (Steam reviews adjusted, with Metacritic)   | Store cards, rows and chart tables, one chip with its parts in the tooltip ([Catalogue](catalogue.md#hydra-rating)); the game page shows the separate figures under **Reception** |
| Games played outside Hydra (for suggestions)             | **Based on** in For you ([Catalogue](catalogue.md#feedback-from-cards))                                                                                                           |
| ProtonDB, How Long to Beat                               | Their own sidebar sections, each with its site link in the header                                                                                                                 |
| Other external links (Steam, SteamDB, PCGamingWiki)      | **Links** sidebar section                                                                                                                                                         |
| RenoDX mod, ReShade version, HDR mod status              | **Options → Tools**, the RenoDX part below the tool list                                                                                                                          |
| Which tools apply (OnlineFix, HDR, RenoDX, …), why       | **Options → Tools** ([Tools and fixes](game-tools.md)); others link there                                                                                                         |
| Past launches: outcome, exit code, tools, logs           | **Options → Compatibility**, the Runs part ([Game runs](game-runs.md))                                                                                                            |

## Requirements and languages

Below **About this game**: **System requirements** shows Steam's Minimum and
Recommended lists side by side (stacked in a narrow window; one is left out
when Steam has none, and the whole block when it has neither), then
**Language** as two lines: every language, then the ones with voice-over. Both
sit in the centred column ([below](#the-centred-column)). Not shown for
LaunchBox games, which have no store requirements.

## The centred column

The gallery, thumbnails, "About this game", review prompt, reviews, DLC and
news and similar games share one centred column, `@include
globals.reading-column`, inside `.game-details__description-content` (a size
container). Each side's gutter is at most 20 % / 25 % of that area (the old
60 % / 50 % layout, still the case on very wide windows), at least 50px, and
otherwise just enough to keep the column about 760px wide, so a half-screen
window is not mostly margin. Below 1280px viewport width the column is full
width. A new block in that column uses the mixin instead of its own width rules.

## Patterns across pages

Decided 2026-10-31 (roadmap phase 13 item 7), so the catalogue, library and
home are reworked once and stay one app.

**Two cards.** A game in your library is a `LibraryGameCard` wherever it is
shown (library, home shelves of your games): your cover, playtime when there
is some, the update dot, a dimmed cover when it isn't installed, Play on
hover. A game from the store is a `StoreGameCard` (the wide header image with
the Hydra rating, year and tags under it) or, in a list, a `StoreGameRow`
(`components/`): the catalogue's shelves, grid and list use these. The
portrait `VerticalCoverCard` stays for friends playing and similar games.
Home's suggestions are `StoreGameCard`s too. Upstream's wide `GameCard` stays only in its Hot now shelf.

**One library badge.** A store card or row that is in your library carries
`GameLibraryBadge` (`components/`): **Installed**, **In library** or **Wishlisted**, from
`useLibraryStates()`. On a cover it is the `overlay` variant in the top-left
corner. No page invents its own wording for this.

**One order of states**, for any place that can show only one: playing now,
downloading, update available, installed, in library, wishlisted.

**One filter system for your games.** The library page and the sidebar share
`useLibraryView` (tabs, filters, sort). The catalogue has its own filters
because it searches the store, not your games.

**Every card opens the game page**, through `buildGameDetailsPath`; the game
page links back to where a fact lives (this table) instead of repeating it.

| Fact                     | Shown as                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| In your library          | `GameLibraryBadge` on store cards and rows                                                                      |
| On your wishlist         | `GameLibraryBadge` (**Wishlisted**); the catalogue star                                                         |
| Installed                | The same badge; on your own cards, a cover not dimmed                                                           |
| Update available         | The dot on `LibraryGameCard`; the hero bar's chip                                                               |
| Playtime                 | `LibraryGameCard` badge when there is some; hero bar                                                            |
| Saves backed up / failed | The game page's save widget; a failure also as a cloud alert on `LibraryGameCard` and list rows, pointing there |

## Options

The game page's **Options** button and the **Options** entry in the
right-click menu of the library and sidebar open the same dialog. (Upstream
calls the menu entry "Properties".) The right-click submenu with hide, pin,
folders and remove is called **Manage**, as on Steam, so the menu no longer
shows two "Options" entries.

## Your game

For a game in the library, the top of the right-hand sidebar keeps your own
data apart from the store's, like Steam's "Your stuff":

- **Play status** (set, change or clear) and **Your rating**, one to ten stars;
  click the current rating again to clear it.
- **Favorite**, **Pin** (signed in, store games only) and **Wishlist**
  toggles; each shows filled and teal while on.
- A **Mark as finished** offer when you have everything unlocked or have
  played as long as the main story takes ([finished suggestion](#finished-suggestion)).
- **Your copies**, when the game has copies from several stores or folders:
  each one's source, whether it is installed and its playtime.
- **Other versions in your library**: games whose title is this one's plus
  more words, or the other way round ("Dark Souls" and "Dark Souls III"),
  linking to their pages.
- [Steam history](steam-history.md) (playtime breakdown and unlock dates), when
  imported.
- [Notes](library.md#notes).

Playtime, last played and achievements are not repeated here; they live in the
hero bar and the achievements section. When a download source has a newer
release ([updates](updates.md)), an **Update to …** button appears next to
**Play** in the hero bar and opens the update.

## Sidebar sections

One continuous column, not a stack of cards: each section is a block under a
hairline with a small uppercase label (`SidebarSection variant="flat"`), no
background header and no collapse, in the style of Steam's store and library
sidebars. Rows of label and value use `SidebarRows` / `SidebarRow`, so ProtonDB,
Reception, HowLongToBeat and Details look the same. Site links (ProtonDB,
Steam, HowLongToBeat) sit on the label's right.

Top to bottom: **Your game**, ProtonDB (Linux), **Achievements**,
**Reception**, genres, HowLongToBeat, controller support, **Links**.
Requirements and languages are not here; they are in the middle column
([above](#requirements-and-languages)). The catalogue's filter panels still use
the collapsible `card` variant.

- **Achievements** lists up to four, each with icon, name and a one-line
  description (the full text is its tooltip); unlock dates are on the achievements page.
- **Reception** is for Steam games and shows what players think, with no
  account or key: Steam's review summary (label, percentage positive, number
  of reviews), the number of players in game right now, and the Metacritic
  score Steam lists, linking to Metacritic. A line is left out when Steam has
  no data for it, and the whole section when it has none. Results are cached
  for 15 minutes; the code is in `main/services/steam-reception.ts`.
- **ProtonDB** and **HowLongToBeat** link to their site from their own
  headers. When a site has no data for the game the section, and so its link,
  is not shown.
- **Links** opens Steam, SteamDB and PCGamingWiki for games with a Steam app
  id, and a PCGamingWiki search otherwise. The page has no "More" menu any
  more; favorite, pin and wishlist moved to **Your game**.

Games not in the library show the same sidebar without **Your game**; next to
**Add to library** they get **Add to wishlist**, which adds the game and puts
it on the [wishlist](library.md#wishlist), so Hydra tells you when a source
adds it.

## DLC and news

Steam games list their DLC (up to 24, with a link to Steam's full list when
there are more) with picture and price; a DLC opens on Steam. Hydra's API
has no store data for DLC ids, so each is looked up through the same Steam
store request the game page uses, and cached with it. Below that, the
game's three latest Steam announcements, as on the home page.

## Genres and similar games

The sidebar lists the game's eight most voted Steam tags (Souls-like,
Atmospheric, …) under **Genres**, in English so they match the library's genre
filter; clicking one opens the [catalogue](catalogue.md) filtered to that tag.
When the catalogue has no tags for a Steam game yet (new releases), Hydra asks
Steam for them. A game with none anywhere shows the store's genres instead, and
so does one with genres of your own ([Details](#details)); those open the
library filtered to the genre.

**Similar games** ("More like this") lists up to 24 games, as a carousel of
three at a time. The ones you own come first and are marked **In library** or
**Installed**. For a Steam game the list comes from Steam's own "More like
this" page, which is far better for niche titles than Hydra's catalogue. Hydra
re-ranks it (`src/shared/similar-games.ts`, `src/main/services/steam-similar.ts`):

- Candidates are the page's released, top-selling, new-release and free
  grids. Demos, prologues, test builds and anything that isn't a game are
  dropped.
- Each candidate scores the cosine similarity of its 20 vote-weighted Steam
  tags against the game's, where a tag most candidates share counts for less
  than a rare one, plus Steam's own order (it reflects what players actually
  own) and a small bonus for review count. Tags alone favoured obscure games.
- Results are cached for six hours per game. If Steam has no list or can't be
  reached, and for non-Steam games, Hydra's catalogue endpoint is used as
  before.

## Details

**Options → Details** replaces what the store shows for the game:

- **Description**: plain text shown under "About this game" instead of the
  store description. Line breaks are kept.
- **Genres**: a comma-separated list used on the game page and by the
  library's genre filter instead of the Steam tags.
- **Store details language**: the language the game page asks the store for
  (description, requirements, …), for games whose store page is better in
  another language. **Same as Hydra** follows the app language. Steam and
  Epic fall back to English for languages they don't have.

**Use store details** clears the description and genres. The title and
images are edited as before, under **General** and **Customization**.

## Artwork

The artwork picker under **Customization** shows the stores' own cover,
hero, logo and icon first, labelled Steam, Epic Games or LaunchBox, from
every store the catalogue links the game to, followed by SteamGridDB's
results. Store artwork needs no account, so the picker opens while signed
out too.

SteamGridDB results need either your own API key or a Hydra sign-in. Add the
key (free, under Preferences → API on steamgriddb.com) in
**Settings → Integrations → Artwork → SteamGridDB**; **Connect** checks it
first. With a key, Hydra asks SteamGridDB directly, also for Big Picture's
picker and Epic games' default artwork. Steam games are looked up by app id;
other games by title, and only an exact, unambiguous match is used. Without
a key, signed-in users keep going through Hydra's proxy. The code is in
`src/main/services/steam-grid-db-direct.ts`.

## Missing files

Hydra checks every game's executable shortly after it starts, and when a
launch finds it gone. A game whose executable is missing is marked:

| Status            | Meaning                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| Files missing     | The drive is there but the executable is not (moved or deleted).           |
| Drive not mounted | The executable sits on a drive or share that is not mounted at the moment. |

The sidebar shows a warning icon next to the game, and the game page shows the
status in place of **Play**. Clicking it checks again (for a drive that has
been mounted since); if the files are still missing, it opens the game's
**Locations** options to pick the executable. Picking an executable clears
the status. Upstream's scan still clears executables that are gone for good.

## Launch animation

Pressing **Play** answers at once: the button presses in and turns into a
glowing pill with a spinner and the current step (Dependencies, Compatibility
layer, Achievements, Starting), then a check when the game is detected, until
the game shows as running. A failed or cancelled launch puts **Play** back.

The launcher window that opens next plays an entrance (backdrop, cover, title
and stats rise in one after another). The cover wears a ring in a lifted
version of its own colour that spins while Hydra prepares the game; the steps
seen so far are listed below the status line. When the game is detected the
ring closes, the cover pops and a check lands, then the window zooms out and
closes. A failed compatibility layer turns the ring red.

While the compatibility layer is being prepared the window offers **Cancel**,
which closes the game process that was started and the window; after a failure
it offers **Close**. Hydra's main window is already open behind the launcher, so
there is no "Open Hydra" button.

All of it honours `prefers-reduced-motion`. The code is in
`pages/game-launcher/` and `pages/game-details/hero/use-launch-phase.ts`; the
launcher statuses are also sent to the app windows so the button can follow
them.

## When the game closes

When a game that was running closes while its page is open, the page marks it
for a few seconds: **Play** comes back with a pop and a ripple ring, a
`+42m` chip appears beside it once Hydra has recorded the session
(sessions under a minute show no chip), the "Played for / Last played" lines
rise in with a teal flash. The logic is in
`pages/game-details/use-session-end.ts`.

## Middle-click autoscroll

Chromium has no middle-click autoscroll on Linux, so Hydra adds it: press the
middle mouse button over a scrollable area (not on a link or button) and move
the mouse. A quick click keeps scrolling until the next click, Escape or the
mouse wheel; holding the button scrolls until it is released.

## Fixes

Behaviour that differs from upstream because of a fix (several found in other
forks, see the [fork survey](../fork-survey.md)):

- Changing or resetting a game's playtime updates the library and sidebar
  right away, not only the game page.
- When a catalogue search fails, the catalogue says so instead of showing
  loading placeholders forever. Failing tag, genre, publisher and developer
  lists only leave those filters empty.
- An achievement the catalogue has no entry for still notifies, under its
  raw name with the game's icon. Upstream dropped it silently.
- More than ten new achievements from one file (a Steam cache or imported
  save seen for the first time) show one combined notification instead of a
  popup each.
- Videos pause while the window is minimised or hidden and resume after,
  instead of fast-forwarding to catch up.
- When Hydra's API doesn't answer at startup, the window opens after at most
  8 seconds with the cached profile. Upstream waited for the connection to
  time out, which took 134 seconds when measured (2026-10-19); without any
  network it already opened at once.

## Finished suggestion

The game's block offers **Mark as finished** when you have unlocked every
achievement (Hydra's own, or Steam's for games from the
[Steam import](steam-history.md)), or played as long as How Long to Beat's main
story takes. **Not now** stops the offer for that game. Finished and dropped
games, and games without achievements or a story length, get none.
