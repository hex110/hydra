# Widescreen patch

A tool in a game's **Options → Tools** for games that lock their picture to
16:9. It puts a community patch into the game folder and switches it on and off
like the other tools ([Tools and fixes](game-tools.md)).

## What it is

Lyall's SUWSF patches ([UltrawidePatches](https://codeberg.org/Lyall/UltrawidePatches)):
a `winmm.dll` (an ASI loader) that loads `SUWSF.asi`, which finds the game's
aspect-ratio code in memory and changes it, with `SUWSF.ini` to switch each
patch off. Each `.asi` is built for one game, so Hydra only offers a patch to
the games its definition names (`WIDESCREEN_PATCHES` in
`src/shared/widescreen-patches.ts`). There is no generic patch: a game with no
definition has no row.

## Games

| Game                 | Patch                                 | Why                                                                                                                                                                                          |
| -------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MOLE (Steam 4064510) | Lyall's Crime Boss: Rockay City build | Lyall has no MOLE build. Both are Unreal Engine 5, and a MOLE ultrawide video's commenters report the Crime Boss files fix the picture. **Not yet checked on a real MOLE install by Hydra.** |

To add a game: add a definition with its Steam app id, the zip pinned to a
commit URL and its SHA-256, the folder in the zip that goes to
`<Project>/Binaries/Win64`, the settings file and the proxy DLL. A test checks
that every package is pinned.

## Modes

| Mode | Does                                                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- |
| Auto | Nothing installed; the row says the patch exists. It changes the game with someone else's binary, so Hydra does not do it unasked |
| On   | Downloads the zip once (checked against its hash), installs it, keeps it installed                                                |
| Off  | Removes what Hydra installed and puts back any file it replaced                                                                   |

The files go next to the game's `-Shipping` executable (the same folder
OptiScaler uses for Unreal games). Everything placed is listed in
`.hydra-widescreen-patch.json` there, so Off undoes it exactly. The cache is
`<userData>/widescreen-patches/`.

## Under Proton

The game must load `winmm.dll` from its folder instead of Wine's. Hydra adds
`winmm=n,b` to `WINEDLLOVERRIDES` when the patch is installed, like the
OptiScaler and ReShade overrides. Nothing to type in the launch options.

## Blocked and missing

- A `winmm.dll` the game or another tool owns (OptiScaler under that name):
  the row is **Blocked** with the file named, and On installs nothing.
- Files removed from the game folder later (an update or a verify): the row is
  **Blocked** and says which; Off then On puts them back.

## Game updates

A patch is made for one version of the game. When a
[game update in Hydra](updates.md#installing-an-update) ships a file the patch
replaced, Hydra removes the patch instead of putting it back, and the update
notification says so: install it again once it supports the new version. An
update that leaves the patch's files alone takes the patch out and puts it
back. If something else replaces a patched file later (a launcher's update),
removing the patch keeps the new file instead of restoring the old backup.

## Not yet

Nothing checks that the patch loaded (no first-run check), and the pinned build
is whatever Lyall had on 2025-05-17.
