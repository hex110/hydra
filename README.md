# Hydra Plus

**Hydra Plus** is a fork of [Hydra Launcher](https://github.com/hydralauncher/hydra)
focused on playing Windows games on Linux with as little manual work as
possible: a game should be ready to play, with its fixes, mods and saves, as
soon as it is downloaded or found on disk. It installs next to upstream Hydra
with its own data, and updates from
[this fork's releases](https://github.com/hex110/hydra/releases).

## What's new compared to Hydra

- **Games are ready when they finish downloading.** The Wine prefix is created
  at install instead of on first launch, OnlineFix games get the files and DLL
  overrides they need, OptiScaler is installed where it helps, saves and
  achievements are imported from your Windows drive, and your own
  post-install command runs last.
- **Launch options without retyping them.** Default launch options for every
  game, and launch rules that add options to every game or to games
  containing a given file (HDR, ReShade, Unity on Vulkan, …), each overridable
  per game and shareable as JSON.
- **Your existing games and saves come along.** Library folders such as
  `~/Games` are scanned and matched to the catalogue, download sources are
  matched against games on disk, and saves and crack achievements are imported
  from a Windows install, with backups and without overwriting newer files.
- **Faster downloads from Steam.** A Firefox/Chrome add-on adds "Download" and
  "Open in Hydra Plus" buttons to Steam store pages, SteamDB, ProtonDB, Backloggd,
  OpenCritic, Metacritic and more (`hydraplus://` links); the
  download dialog opens with the best repack preselected according to your
  repack preferences, and can start right away.
- **Packaged for Linux.** AppImage and Arch (`.pacman`) builds, a separate app
  id and data folder, so it runs side by side with Hydra.

Every feature has its own settings page and documentation:

| Feature                                                           | What it does                                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Game setup](docs/features/game-setup.md)                         | Creates a game's Wine prefix as soon as it is installed or found, not on first launch, and can run your own command afterwards (tweaks, scripts).                                                                                  |
| [Default launch options](docs/features/default-launch-options.md) | Launch options applied to every game, with a per-game opt-out.                                                                                                                                                                     |
| [Home page](docs/features/home.md)                                | Starts with your games: last played, a play heatmap and streak, and shelves you can hide and reorder for continue playing, downloads, updates, recently added, almost done, backlog, wishlist, friends, news and suggestions.      |
| [Library](docs/features/library.md)                               | Local / Steam / Epic tabs, play status, filters, grouping, a card size slider, multi-select, keyboard navigation, a details pane, notes, statistics, saved filters, local collections and a wishlist that alerts on new downloads. |
| [Catalogue](docs/features/catalogue.md)                           | A front page with recommendations and a discovery queue, a grid view, Metacritic, length and download size on rows, screenshot previews, "In library" marks and a list that keeps your place.                                      |
| [Library folders](docs/features/library-scanning.md)              | Scans folders such as `~/Games` for installed games, identifies them by executable or folder name and adds them to the library.                                                                                                    |
| [Launch rules](docs/features/launch-rules.md)                     | Adds launch options to every game or to games containing a given file (HDR, ReShade, …), with per-game overrides, built-in rules and copy/paste sharing.                                                                           |
| [Browser add-on](docs/features/browser-addon.md)                  | A Firefox/Chrome add-on that adds "Download" and "Open in Hydra Plus" buttons to Steam, SteamDB, ProtonDB, Backloggd, OpenCritic, Metacritic and more, with the best download chosen automatically.                                |
| [Save import](docs/features/save-import.md)                       | Brings a game's saves and achievements over from a Windows install on another drive when the game is added, never overwriting newer files and backing up what it replaces.                                                         |
| [OnlineFix games](docs/features/online-fix.md)                    | Loads OnlineFix's proxy DLLs and gives its games Steam's client files, so they start without manual prefix fixes.                                                                                                                  |
| [OptiScaler](docs/features/optiscaler.md)                         | Downloads OptiScaler and installs it into games that support it, with INI overrides, OptiPatcher and clean removal.                                                                                                                |
| [Local source matching](docs/features/local-source-matching.md)   | Matches download sources against games on your machine too, catching releases the server misses and refreshing stale ones.                                                                                                         |

### Install

Download the AppImage, or the `.pacman` package on Arch-based systems
(`sudo pacman -U hydra-plus-*.pacman`), from the
[latest release](https://github.com/hex110/hydra/releases/latest).

Hydra Plus uses Hydra's servers for the catalogue, accounts and download
sources, exactly like Hydra. Both apps handle `hydralauncher://` links
(sign-in, adding sources); the one launched last receives them.

---

<details>
<summary>Upstream Hydra Launcher README</summary>

<div align="center">

[<img src="https://raw.githubusercontent.com/hydralauncher/hydra/refs/heads/main/resources/icon.png" width="144"/>](https://help.hydralauncher.gg)

  <h1 align="center">Hydra Launcher</h1>

  <p align="center">
    <strong>Hydra Launcher is an open-source gaming platform created to be the single tool that you need in order to manage your gaming library. Hydra is written in Node.js (Electron, React, Typescript) and Rust, with libtorrent providing the torrent engine.</strong>
  </p>

[![build](https://img.shields.io/github/actions/workflow/status/hydralauncher/hydra/build.yml)](https://github.com/hydralauncher/hydra/actions)
[![release](https://img.shields.io/github/package-json/v/hydralauncher/hydra)](https://github.com/hydralauncher/hydra/releases)
[![chocolatey](https://img.shields.io/chocolatey/v/hydralauncher.svg)](https://community.chocolatey.org/packages/hydralauncher)

![Hydra Launcher Home Page](./docs/screenshot.png)

</div>

## Features

- Add games that you own to your library
- Have a nice profile that shows what you are playing to your friends
- Save your game progress in the cloud with Hydra Cloud
- Unlock achievements
- Navigate through a rich catalogue with a powerful suggestion algorithm
- Discover new games that you haven't played before

## Build from source and contributing

Please, refer to our Documentation pages: [docs.hydralauncher.gg](https://docs.hydralauncher.gg/getting-started)

### Local development requirements

- Node.js + Yarn
- Rust toolchain (for `hydra-native`)
- Git and a C++ toolchain (Visual Studio C++ Build Tools on Windows, GCC/Clang on Linux, Xcode command-line tools on macOS). The native build obtains CMake and CTest automatically through vcpkg.

After installing dependencies, `postinstall` now builds the Rust native addon automatically (`hydra-native/hydra-native.node`).

The native build includes a Rust wrapper around pinned libtorrent. Development and packaged torrenting no longer require Python.

On Windows x64 and Linux x64, the libtorrent bridge comes prebuilt from `native/torrent-bridge/prebuilt`, so installs skip compiling libtorrent through vcpkg. Other platforms build it from source. When a branch push changes `native/torrent-bridge` or `scripts/build-torrent-bridge.cjs`, the "Torrent bridge prebuilts" workflow rebuilds the binaries and commits them to that branch; until then, installs build the bridge from source. Set `HYDRA_TORRENT_BRIDGE_FROM_SOURCE=1` to always build it from source.

## Contributors

<a href="https://github.com/hydralauncher/hydra/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=hydralauncher/hydra" />
</a>

## License

Hydra is licensed under the [MIT License](LICENSE).

</details>
