# Browser add-on

The [Hydra Plus for Steam](../../extensions/steam/README.md) add-on puts a
**Hydra Plus** box on Steam store pages. Its buttons are links to Hydra Plus's
own `hydraplus://` scheme, which upstream Hydra does not claim, so they always
reach Hydra Plus. The browser asks once before opening the app.

## Links

| Link                                                | Opens                                                  |
| --------------------------------------------------- | ------------------------------------------------------ |
| `hydraplus://game?shop=steam&objectId=<app id>`     | The game's page.                                       |
| `hydraplus://download?shop=steam&objectId=<app id>` | The game's page with its download options (see below). |

Any web page can open these links, so Hydra Plus only accepts Steam app ids
and never downloads without either your confirmation or the setting below.

## Choosing the download

A download link opens the game's download options and picks the best one for
you, by the preferences in **Settings → Downloads → Automatic download
choice**:

1. Downloads that need a debrid service you have not set up, or whose links
   are known to be down, are left out.
2. Releases whose name contains one of the **skipped words** (for example
   `macOS, Linux`), or that are larger than the **size limit**, are left out.
3. The rest are ordered by **preferred sources**, then by the newest release
   or the smallest download.

The download settings then open for the chosen release, with the usual
downloader, folder and extraction defaults, so you can review it and press
**Download**. With **Start those downloads immediately** on, Hydra Plus
presses it for you as soon as everything is ready. It still stops if there is
not enough disk space or the folder is not writable.

If nothing matches the preferences, the download options stay open with a
note so you can pick one yourself.

After the download, the usual [game setup](game-setup.md) runs: Wine prefix,
OnlineFix, OptiScaler and your post-install command.
