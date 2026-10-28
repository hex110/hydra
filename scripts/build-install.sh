#!/usr/bin/env bash
# Builds Hydra Plus from the working tree and installs the .pacman over the
# installed copy, so a change can be tried in the real app.
#
#   scripts/build-install.sh              build, then install
#   scripts/build-install.sh --no-install build only (dist/hydra-plus-<version>.pacman)
#
# The install step runs `sudo pacman -U`. On the desktop that opens the
# consent dialog on the physical screen; over SSH it cannot show.
set -euo pipefail

install=1
for arg in "$@"; do
  case "$arg" in
    --no-install) install=0 ;;
    -h | --help)
      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

cd "$(dirname "$0")/.."

# Same endpoints as .github/workflows/plus-release.yml. The launcher subdomain
# stays empty so the bundled renderer, with the fork's features, is used.
export MAIN_VITE_API_URL=https://hydra-api-us-east-1.losbroxas.org
export MAIN_VITE_AUTH_URL=https://auth.hydra.losbroxas.org
export MAIN_VITE_CHECKOUT_URL=https://checkout.hydralauncher.gg
export MAIN_VITE_LAUNCHER_SUBDOMAIN=""

# /tmp is a RAM tmpfs and fpm's .pacman staging overflows it (ENOSPC).
export TMPDIR="$PWD/dist/.tmp"
mkdir -p "$TMPDIR"
trap 'rm -rf "$TMPDIR"' EXIT

if [ ! -f binaries/epic-prerequisite-runner/x64/epic-prerequisite-runner.exe ]; then
  echo "Missing binaries/epic-prerequisite-runner/x64/epic-prerequisite-runner.exe." >&2
  echo "It can't be built here; copy /opt/Hydra/resources/epic/* from an upstream install." >&2
  exit 1
fi

version="$(node -p 'require("./package.json").version')"
package="dist/hydra-plus-${version}.pacman"

echo "==> Building Hydra Plus ${version}"
yarn build:native
yarn electron-vite build
yarn electron-builder --linux pacman --publish never

if [ ! -f "$package" ]; then
  echo "Build finished but ${package} is missing." >&2
  exit 1
fi

if [ "$install" -eq 0 ]; then
  echo "==> Built ${package}"
  exit 0
fi

echo "==> Installing ${package}"
sudo pacman -U --noconfirm "$package"

if pgrep -f "[/]opt/Hydra Plus/" >/dev/null; then
  echo "==> Hydra Plus is still running the old build; quit it from the tray and start it again."
fi
echo "==> Installed Hydra Plus ${version}"
