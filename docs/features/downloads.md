# Downloads and extraction

## Where downloads go

**Settings → General → Downloads path** sets the default folder. Archives are
downloaded there and extracted next to themselves, into a folder named after
the archive, so the game ends up in the same place. The download dialog can
pick a different folder for a single game.

## Free space

The download dialog refuses a download that does not fit on the drive, as
upstream does. Below the download options it shows the drive's free space next
to what each step needs and what is left afterwards: the download, extracting
it (archive plus unpacked game at the peak) and running an installer (unpacked
installer plus installed game at the peak). The numbers follow the **delete
archive** tick. Hydra can't know the unpacked or installed size before
downloading, so both are taken to be as big as the download; the extraction and
installer rows are marked as estimates, and a figure that doesn't fit on the
drive turns red.

Before extracting an archive, Hydra lists its contents with 7-Zip and stops
with **Not enough space to extract** when the unpacked size (plus a 512 MB
margin) does not fit. Nothing is written in that case; free up space and
extract again from the Downloads page. Archives whose file list is encrypted
cannot be listed and are extracted without the check.

## Finished downloads

The **Completed** list shows the newest finished download first, by when it
finished (older downloads by when they started). Each row offers what makes
sense for the files on disk:

| Files                                                                        | Button                             |
| ---------------------------------------------------------------------------- | ---------------------------------- |
| The game has an executable                                                   | **Play** (**Close** while it runs) |
| An archive nobody has unpacked, or whose last extraction failed              | **Extract files**                  |
| An unpacked folder with `setup.exe` (or a lone `.exe`) and no executable yet | **Install**                        |
| An unpacked folder with nothing to install                                   | **Open folder**                    |
| Nothing left on disk                                                         | "Files missing"                    |

The ⋮ button opens the same menu as right-clicking the game in the sidebar
(torrents also get seeding controls under **Manage game**). **Remove files** is
in that menu's **Manage game** submenu. The ✕ button clears a row from the list
and **Clear all** clears every finished one. Clearing only hides the row; the
files, the game and its download record stay, so **Remove files** and **Open
download location** keep working. Rows that are seeding or extracting are not
cleared. Starting a new download of the game shows it again.

If you unpack a download yourself, Hydra notices the next time the Downloads
page looks at it (when it opens or the window regains focus): a folder named
after the archive next to it counts as the unpacked game, the download points
at that folder, and the executable is looked for as after Hydra's own
extraction. Then the row offers **Play** or, if only an installer is there,
**Install**. A folder left behind by a failed extraction is not trusted.
Hydra does not watch an installer: after running it, set the game's
executable under **Properties** (or let a library scan find it) and the row
turns into **Play**.

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
