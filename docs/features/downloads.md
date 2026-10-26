# Downloads and extraction

## Where downloads go

**Settings → General → Downloads path** sets the default folder. Archives are
downloaded there and extracted next to themselves, into a folder named after
the archive, so the game ends up in the same place. The download dialog can
pick a different folder for a single game.

## Free space

The download dialog refuses a download that does not fit on the drive, as
upstream does, and warns when the drive has less than twice the download's
size free while automatic extraction is on: the unpacked game needs room too.

Before extracting an archive, Hydra lists its contents with 7-Zip and stops
with **Not enough space to extract** when the unpacked size (plus a 512 MB
margin) does not fit. Nothing is written in that case; free up space and
extract again from the Downloads page. Archives whose file list is encrypted
cannot be listed and are extracted without the check.

## Pasting a Steam link

Pasting a Steam store link (`https://store.steampowered.com/app/<id>/…`, a
Steam community or SteamDB app link, or `steam://store/<id>`) anywhere outside
a text field, or into the header search, opens that game with its download
options with the best repack marked **Recommended**, as the
[browser add-on](browser-addon.md) does. It never starts the download on its
own.

## Cancelling

Cancelling a download asks first, as upstream does, and the dialog has
**Keep the downloaded files**. Checked, Hydra stops the download without
deleting anything: the download folder stays, including a partly downloaded
file (upstream always deleted both). The download leaves the list either way.

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

## Background tasks

Long actions that are not downloads show above the downloads: the Steam
history import, the Steam wishlist check, a Floppy library sync or preview, a
pull from Floppy, adding Floppy games to the library, and
changes waiting to be sent to Floppy (a game's change is sent about ten
seconds after it happens, so a burst shows as "N waiting to be sent"). Each
shows its progress, and a finished one stays with its result until you dismiss
it. Scheduled runs that changed nothing leave nothing behind.

A failed task says why in plain words (Floppy can't be reached, Steam rejected
the key, the Steam profile is private, the service is rate-limiting or had a
server error) and has **Try again**. If you dismiss a failure, scheduled runs
that fail the same way stay quiet until one succeeds or the reason changes;
the integration's card in **Settings → Integrations** still shows it.
