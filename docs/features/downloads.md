# Downloads and extraction

## Where downloads go

**Settings → General → Downloads path** sets the default folder. Archives are
downloaded there and extracted next to themselves, into a folder named after
the archive, so the game ends up in the same place. The download dialog can
pick a different folder for a single game.

## Interrupted extraction

If Hydra Plus quits while it is extracting a download, the extraction starts
again on the next launch: everything is extracted again over the partial
files, and then the usual steps follow (archive deletion, executable
detection, game setup). Upstream Hydra cleared the extracting state and left
the half-extracted folder behind, with the game still asking to be
downloaded.

An extraction can also be restarted by hand from the download's menu on the
Downloads page.

## Executable after a download

Once a download is extracted, Hydra looks for the game's executable:

1. The executable catalogue's known names for the game, as upstream does.
2. If the catalogue has nothing for the game (common for new releases), the
   same guess the library scan uses for unrecognised folders: installers,
   redistributables, crash handlers and tools are ignored, and the `.exe`
   whose name matches the game title, near the top of the folder and largest,
   wins.

Repacks that still need installing (only `setup.exe`) get no executable, as
before.
