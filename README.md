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

## Hydra Plus

This is **Hydra Plus**, a fork of Hydra Launcher focused on playing Windows
games on Linux with as little manual work as possible. It installs next to
upstream Hydra with its own data, and updates from
[this fork's releases](https://github.com/hex110/hydra/releases).

| Feature                                                           | What it does                                                                                                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Game setup](docs/features/game-setup.md)                         | Creates a game's Wine prefix as soon as it is installed or found, not on first launch, and can run your own command afterwards (save imports, tweaks). |
| [Default launch options](docs/features/default-launch-options.md) | Launch options applied to every game, with a per-game opt-out.                                                                                         |
| [Library folders](docs/features/library-scanning.md)              | Scans folders such as `~/Games` for installed games, identifies them by executable or folder name and adds them to the library.                        |
| [HDR](docs/features/hdr.md)                                       | One switch, globally or per game, for HDR through Proton's Wayland driver.                                                                             |
| [OnlineFix games](docs/features/online-fix.md)                    | Loads OnlineFix's proxy DLLs and gives its games Steam's client files, so they start without manual prefix fixes.                                      |
| [OptiScaler](docs/features/optiscaler.md)                         | Downloads OptiScaler and installs it into games that support it, with INI overrides, OptiPatcher and clean removal.                                    |
| [Local source matching](docs/features/local-source-matching.md)   | Matches download sources against games on your machine too, catching releases the server misses and refreshing stale ones.                             |

### Install

Download the AppImage, or the `.pacman` package on Arch-based systems
(`sudo pacman -U hydra-plus-*.pacman`), from the
[latest release](https://github.com/hex110/hydra/releases/latest).

Hydra Plus uses Hydra's servers for the catalogue, accounts and download
sources, exactly like Hydra. Both apps handle `hydralauncher://` links
(sign-in, adding sources); the one launched last receives them.

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
