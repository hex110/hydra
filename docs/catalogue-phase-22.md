# Catalogue, phase 22: groups you can shape, newer games first

Written 2026-11-03 with the owner, after using phase 21's taste groups. Start
from [Catalogue, phase 21](catalogue-phase-21.md) and
[Catalogue → How it chooses](features/catalogue.md#how-it-chooses).

## What using phase 21 showed

- **The FPS group mixed unlike games.** CS2 (1,000 h), Ace Combat 8, Civ 6,
  Half-Life, Wolfenstein, Deadlock, Left 4 Dead 2, Dead by Daylight, Rainbow
  Six Siege. Format tags (Singleplayer, Multiplayer, PvP) take no part in the
  grouping, so a story shooter and a competitive one look the same. Its first
  suggestions were Counter-Strike: Source and Modern Warfare 2 (2009).
- **There is no way to shape a group.** The ✕ in Details leaves a game out of
  every suggestion, not one group, and multiplayer games can't be left out
  together.
- **Old games rank high.** "Popular" counts all reviews ever written, so a
  2009 game with a large back catalogue of reviews beats a new one.
- **"Last 90 days" was wrong.** It still counted every rated, wishlisted or
  backlogged game with no recent play, and Details showed all-time hours. The
  owner doesn't want the mode: Games mode is for "like what I play now".

## Owner decisions (2026-11-03)

1. **Recency is a slider** (Older ↔ Newer, as now), and by default it clearly
   favours newer games. Others can move it.
2. **Leave out multiplayer games** both for all groups and per group.
3. **More control over groups**: refine a group by choosing among a few
   sub-groups with representative games, and build a group around one to
   three games.
4. **Last 90 days goes.** Recent play keeps counting up to twice in Groups.

## Work

1. **Remove Last 90 days.** `TuneBasis` is `groups | games | tags`; settings
   version 3 maps `recent` to `groups`.
2. **Newer games first.**
   - Popularity is reviews per year since release
     (`reviewCount / max(1, years)`, `log10(1 + v) / 4.3`, capped at 1), so a
     game's reviews count for less the longer it has had to gather them.
   - The Older ↔ Newer slider is stronger (0.35 instead of 0.25) and, toward
     Newer, games released more than 12 years ago lose a further
     `0.1 × slider × min(1, (age − 12) / 10)`.
   - Default 0.6 (clearly newer). Version 3 moves a stored 0 to 0.6 once.
3. **Group by how a game is played.** The clustering vector gains two
   play-mode dimensions, singleplayer-led and multiplayer-led (a multiplayer
   family tag before Singleplayer, or no Singleplayer), each at half the
   weight of a game's leading tag. They split groups but take no part in
   naming or similarity. A group of ten games or more whose games sit far
   from its centre (weighted mean cosine under 0.45) is split in two, up to
   the cap of eight.
4. **Leave out multiplayer.** `leaveOutMultiplayer` in Tune (all groups) and
   per group in `groupSettings[id].leaveOutMultiplayer`. Multiplayer-led
   games leave the group's taste, and its suggestions must pass the
   Singleplayer rule.
5. **Hide a group.** `groupSettings[id].hidden`: out of Mix all and Discover,
   shown dimmed in Based on with **Show**.
6. **Refine a group.** Splits its games into two or three sub-groups and shows
   each with its name and five representative games (closest to its centre,
   by weight). Keeping one or more saves a group of your own with those
   games, and hides the original.
7. **Build a group around games.** Pick one to three library games; Hydra
   offers a tight, a medium and a broad group around them (games at cosine
   0.7, 0.5 and 0.35 or more to the picked games' centre, at most 15, 40 and
   100), each named and with its games. Keeping one saves it.
8. **Your groups** (`customGroups`: id, game keys) are listed under Based on
   with a **Yours** mark, take part in Mix all by their weight, and can be
   deleted. Their games come from the library as it is now, so a game no
   longer in it drops out.

## As built (2026-11-03)

- The play-mode dimension weighs as much as a game's leading tag (half was
  too weak: CS2 stayed with Half-Life and Wolfenstein), and spread is judged
  on tags alone, since play mode makes every singleplayer game look alike.
  The split threshold is 0.5. On the owner's library this gives eight groups,
  with story FPS (Ace Combat 8, Half-Life 2, Wolfenstein) apart from
  competitive ones (CS2, Deadlock, Left 4 Dead 2, Dead by Daylight, Siege).
- The old-game penalty starts at eight years and is full at sixteen (0.15 ×
  the slider): with the spec's 12 years and 0.1, Modern Warfare 2 (2009)
  still made the shooter group's top ten.
- The global multiplayer switch changes the groups (their games change), so
  a chosen group's id can go and For you falls back to Mix all.
- Group actions sit in a **…** menu on each row.

## Checking

Shared tests: a library of story and competitive shooters splits into two
groups; leave out multiplayer removes CS2-like seeds; reviews per year ranks a
2024 game with 20,000 reviews above a 2009 one with 60,000 on Popular;
proposals around one game come in three sizes; migration v3. Then the owner's
library in a sandbox (with `!downloads!` deleted): the FPS group splits, and
its suggestions lead with recent games.
