# Browser add-on

The [Hydra Plus add-on](../../extensions/steam/README.md) puts
Hydra Plus buttons on game pages: in the top right of Steam store pages, to the
left of **Community Hub**, and under the game's title on SteamDB, ProtonDB,
PCGamingWiki, Backloggd, OpenCritic, Metacritic, IsThereAnyDeal and
HowLongToBeat. Its buttons are links to Hydra Plus's own `hydraplus://` scheme,
which upstream Hydra does not claim, so they always reach Hydra Plus. The
browser asks once before opening the app.

Firefox and Zen install the Mozilla-signed `.xpi` from the release and then
update it on their own; see the add-on's
[README](../../extensions/steam/README.md) for installing and releasing it.

## Library status

An icon beside the buttons shows where the game stands, and the buttons follow:

| Icon   | Game                                                | Buttons                      |
| ------ | --------------------------------------------------- | ---------------------------- |
| Plus   | Not in your library                                 | Download, Open in Hydra Plus |
| Books  | In your library, not downloaded                     | Download, Open in Hydra Plus |
| Check  | Downloaded (it has an executable or installed size) | Open in Hydra Plus           |
| Dimmed | Hydra Plus isn't running, so the status is unknown  | Download, Open in Hydra Plus |

The add-on asks the running app, and asks again whenever you return to the tab.
The app answers on `127.0.0.1:41907` (packaged builds only; a dev build needs
`HYDRA_PLUS_ADDON_PORT`). Any web page can reach localhost, so the app only
answers requests that carry a `moz-extension://` or `chrome-extension://`
origin, which a page cannot forge, and a `Host` header of its own address. It
reports the status of one Steam app id, or of the Steam game one title stands
for, and nothing else.

## Sites without a Steam app id

Steam, SteamDB and ProtonDB have the app id in the page address, and
PCGamingWiki's infobox links the game on SteamDB, so those are exact. The other
sites only know the game's title, so the app matches it to a Steam game:

1. It asks Steam's public store search for the title, and again without
   punctuation if that finds nothing (Steam's search misses `Name - Subtitle`).
2. It accepts only a result with the same name, ignoring case, `™`/`®`, accents
   and punctuation, so a sequel, DLC or soundtrack is never taken for the game.
   An exact name wins over one that only differs by `Remastered` or an edition
   suffix such as `Game of the Year Edition`; among equals Steam's order
   decides.
3. Answers are remembered until the app restarts, and misses for ten minutes.

The status icon's tooltip names the Steam game that was matched. When the app is
running and nothing matches (a console exclusive, or a different name on Steam),
the buttons are hidden. A title can still match the wrong game when two Steam
games share it, such as a remake and its original.

If a site's page has no heading the add-on can sit under (HowLongToBeat, or a
site that changed its layout), the box floats in the bottom right corner after
three seconds.

## Links

| Link                                                | Opens                                                  |
| --------------------------------------------------- | ------------------------------------------------------ |
| `hydraplus://game?shop=steam&objectId=<app id>`     | The game's page.                                       |
| `hydraplus://download?shop=steam&objectId=<app id>` | The game's page with its download options (see below). |
| `hydraplus://game?title=<title>`                    | The game's page, found by title (see above).           |
| `hydraplus://download?title=<title>`                | The game's download options, found by title.           |

The add-on links by title until the app has named the Steam game, and when the
app isn't running, since only the app can look a title up. If a title matches
nothing, Hydra Plus opens the catalogue.

Any web page can open these links, so Hydra Plus only accepts Steam app ids
and titles it can match to a Steam game, and never downloads without either
your confirmation or the setting below.

## `hydralauncher://` links

Other websites link to upstream's `hydralauncher://` scheme, such as a
download source's "Add to Hydra" button. Hydra Plus claims both schemes each
time it starts. Electron registers handlers through `xdg-settings`, which
reads the binary from the desktop file's `Exec` line up to the first space and
so rejects `/opt/Hydra Plus/hydra-plus`; Hydra Plus then writes the same entry
with `xdg-mime default`. Upstream Hydra claims `hydralauncher://` again
whenever it starts, so with both installed these links open whichever started
last.

Hydra account and Steam sign-in don't depend on this: their return links are
caught inside Hydra's own sign-in windows and never reach the system.

## Choosing the download

A download link opens the game's download options and marks the best one for
you, by the preferences in **Settings → Downloads → Automatic download
choice**:

1. Downloads that need a debrid service you have not set up, or whose links
   are known to be down, are left out.
2. Releases whose name contains one of the **skipped words** (for example
   `macOS, Linux`), or that are larger than the **size limit**, are left out.
3. The rest are ordered by **preferred sources**, then by the newest release
   or the smallest download.

The download options list opens with the chosen release marked
**Recommended**, so you can pick it or any other. With **Start those
downloads immediately** on, Hydra Plus instead opens the download settings for
the chosen release, with the usual downloader, folder and extraction defaults,
and presses **Download** for you as soon as everything is ready. It still
stops if there is not enough disk space or the folder is not writable.

If nothing matches the preferences, the download options stay open with a
note so you can pick one yourself.

After the download, the usual [game setup](game-setup.md) runs: Wine prefix,
OnlineFix, OptiScaler and your post-install command.
