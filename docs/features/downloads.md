# Downloads and extraction

## The Downloads page

One list of everything Hydra is doing for you, grouped by state, not by
which feature started the work. A section with nothing in it is not shown;
with all four empty the page says "Such empty". The header has **Check for
updates**, with "Checked <time ago>" once a check has finished this session.

| Section       | What is in it                                                                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Now**       | The active game download as a large card (art, bar, speed chart), then everything else that is moving: an extraction, a Steam install, a mod download, a running background task or long job.       |
| **Up next**   | Queued and paused game downloads (in queue order, **Move up** / **Move down** in ⋮), Steam installs that are waiting, queued or paused, and changes waiting to be sent to Floppy.                   |
| **Needs you** | Failed jobs of every kind, a mod installer that waits for options, and available game updates (by title). Failures come first.                                                                      |
| **Recent**    | Finished work of every kind, newest first: completed downloads (seeding ones too), installed mods, finished background tasks with their result. **Clear all** clears every row that can be cleared. |

Every row is the same `ActivityRow` (`components/activity-row/`): the game's
cover (or an icon), the title, a kind badge (downloader, Steam, Mod, Update,
Floppy, Proton, …), one status line, the shared `ProgressBar` while it runs
(a moving segment while the amount is not known yet) and the actions:

- **✕** in the rightmost slot hides a finished or failed row; on an update it
  is **Ignore this version**. Rows that can't be cleared (running, seeding,
  extracting) leave the slot empty so the columns line up.
- One primary button for the obvious next step: **Play**, **Extract files**,
  **Install**, **Update**, **Resume**, **Try again**, **Choose options**.
- **⋮** holds the rest: **Cancel**, **Open game**, **Open Mods**, **Open in
  Steam**, the game's own menu for game downloads.

Where the page gets its rows is `features/activity/` (pure adapters and
grouping, tested in `activity.test.ts`; `useActivity()` gathers the sources).
The bottom bar reads the same list: one line for the highest-priority work in
**Now** (redistributable install, extraction, game download, Steam install,
mod download, background job), a thin bar, **+N more** and **N needs you**
(failures and installers waiting for options; updates are not counted). It
opens this page.

## Where downloads go

**Settings → General → Downloads path** sets the default folder. Archives are
downloaded there and extracted next to themselves, into a folder named after
the archive, so the game ends up in the same place. The download dialog can
pick a different folder for a single game.

On Linux the folder is settled once, at the first start without one: a fresh
install uses `~/Games` (as Steam and Heroic do) and deletes archives after a
good extraction; an install that already has downloads or installed games
keeps the Downloads folder it used, written down so nothing moves. The
AnkerGames handoff still watches the browser's own Downloads folder.

## Choosing a download

**Open download options** marks the option your preferences rank first
(preferred sources, newest or smallest, excluded words, and only options a
downloader you can use accepts) as **Recommended**. When only one option
exists, it skips the list and opens that option's download settings
straight away; closing them shows the list.

## TorBox for direct links

With a TorBox token set, **TorBox** is offered for releases that have links on
a file host TorBox fetches (Gofile, Pixeldrain, Datanodes, Mediafire,
Fuckingfast, VikingFile), next to the host's own downloader, and is the default
choice. The list in `src/shared/torbox-hosters.ts` is the hosts Hydra already
downloads directly; other hosts stay with their own downloader. Multi-part
groups of links (many `.partN` files) are not offered to TorBox.

Starting the download settles which link TorBox takes
(`resolveTorBoxWebDownload`, tested in `torbox-web.test.ts`):

1. A copy already in the TorBox account (added on its website or by an earlier
   attempt) is used as it is.
2. Otherwise every link of the release is offered to TorBox with "add only if
   cached", in the release's order; the first one TorBox has cached is added and
   downloads from TorBox at once. Links on a host TorBox reports as down are
   skipped, and at most 6 links are checked (TorBox limits how fast links can be added).
3. If none is cached, TorBox fetches the first link itself. The download waits
   as "Waiting for debrid · NN%" (TorBox's progress) for up to an hour, then
   starts by itself when TorBox has the files. Pausing, cancelling and resuming
   work as for a pending Real-Debrid or TorBox torrent.
4. A link TorBox refuses (a server error, a host it can't reach) or fails to
   fetch while the download waits gives way to the release's next link. An
   answer about the account or TorBox's rate limit stops at once, since every
   link would get the same answer.

The chosen link, the links after it and the TorBox ID are kept on the
download, so a resume or restart goes on with the same TorBox download instead
of adding the link again, and can still fall back.
A single file is saved in the download folder itself; a host folder with several
files keeps its folder. The download dialog explains the behaviour under the
downloader list when TorBox is selected for links.

Not done: TorBox fetches no multi-part groups. AnkerGames downloads can't go
through TorBox: the link AnkerGames hands the browser is tied to your IP
address. Use **Download from another source** to pick a release TorBox can
fetch.

## Switching source

A download that is running, paused, queued or failed has **Download from
another source** in its menu (⋮ on the Downloads page, or right-click the
game). It opens the game's download options; starting one there replaces the
current download instead of queueing behind it. Use it when a host is slow,
or to move a release to TorBox.

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
cannot be listed and are extracted without the check. When the files go over
an existing copy, only the files that differ count (see
[Extracting over an existing copy](#extracting-over-an-existing-copy)).

The failure is kept with the download, not just shown in a toast: the row on
the Downloads page says why it failed, with the numbers for a lack of space
("needs 48.4 GB, only 43.7 GB is free, free up at least 5.1 GB more"), until
the next extraction starts. **Extract files** tries again.

## Extracting over an existing copy

When an archive is extracted into a folder that already holds files, Hydra
first compares the archive with them and extracts only what differs. A file
counts as unchanged when its size and CRC-32 match what the archive records;
files the archive does not have (saves, mods, OptiScaler) are not looked at.
This happens when:

- a new release of an installed game is downloaded as a plain download into
  the folder the game is installed in (the archive and the game folder share
  a name, as AnkerGames releases do), or
- a half-extracted folder from an interrupted or failed extraction is there:
  what was already unpacked is kept and only the rest is written.

The space needed is the size of the changed files, not of the whole game, so a
40 GB update that changes 3 GB needs 3 GB (plus the margin) on top of the
archive. A retry after a failure picks up where it stopped. The check reads
the files that have the same size as their archive entry, which takes a
moment on a large game. Archives that store no CRC for their files, encrypted
ones, and archives consumed in place go through the usual full extraction.
A release that is downloaded into a folder of its own is extracted in full.

When the extraction ends in the game's installed folder, the release that was
downloaded becomes the installed version and a pending update for it is
cleared, as an update installed in place does. Updates installed in place
compare against the installed game too; see [Game updates](updates.md).

## Finished downloads

Finished downloads sit in **Recent**, newest first by when they finished
(older downloads by when they started); one whose extraction failed is in
**Needs you** with the reason. Each row offers what makes sense for the files
on disk:

| Files                                                           | Button                             |
| --------------------------------------------------------------- | ---------------------------------- |
| The game has an executable                                      | **Play** (**Close** while it runs) |
| An archive nobody has unpacked, or whose last extraction failed | **Extract files**                  |
| An unpacked folder with an installer and no executable yet      | **Install**                        |
| An unpacked folder with nothing to install                      | **Open folder**                    |
| Nothing left on disk                                            | "Files missing"                    |

The ⋮ button opens the same menu as right-clicking the game in the sidebar
(torrents also get seeding controls under **Manage game**). **Remove files** is
in that menu's **Manage game** submenu. The ✕ button clears a row from the list
and **Clear all** (in **Recent**) clears every finished one. Clearing only hides the row; the
files, the game and its download record stay, so **Remove files** and **Open
download location** keep working. Rows that are seeding or extracting are not
cleared. Starting a new download of the game shows it again.

If you unpack a download yourself, Hydra notices the next time the Downloads
page looks at it (when it opens or the window regains focus): a folder named
after the archive next to it counts as the unpacked game, the download points
at that folder, and the executable is looked for as after Hydra's own
extraction. Then the row offers **Play** or, if only an installer is there,
**Install**. A folder left behind by a failed extraction is not trusted.

## Installing

An installer is `setup.exe`, a file starting with `setup` or `install`, or
one named "… Setup.exe" or "… Installer.exe", within two folders of the top.
Redistributables (`_CommonRedist`, `vcredist`), uninstallers and DLC
installers don't count, and two equally likely files give none. The
Downloads page, **Install** and game options all use this one check
(`findGameInstaller`), so a row that offers **Install** always runs one. A
lone game `.exe` is not an installer.

**Install** runs the installer and watches it. When it exits successfully,
Hydra looks for the new game folder (in `C:\Games`, `C:\GOG Games` and
`Program Files` of the game's prefix on Linux, in the usual drive folders on
Windows), binds the executable and the row turns into **Play**. If nothing is
found yet it keeps looking for ten minutes; you can always set the executable
under **Properties**.

When the catalogue knows no executable names for the game, Hydra guesses the
way a library scan does (installers, tools and redistributables are ignored)
in the folders the installer just changed. A folder named like the game wins;
a single changed folder is trusted; several unnamed ones are not. Without a
match the hero shows **Find executable**: its main part runs the same search
on demand (every folder in the prefix counts, so only a folder named like the
game is trusted), and the arrow offers **Select manually…**.

A library game that was never downloaded through Hydra gets a split
**Download** button. Its arrow offers **Choose game folder…** for a copy
installed some other way: Hydra finds the executable in that folder the way
a library scan does, and opens the file picker there if it can't. When the
game has no download source at all, **Locate game** is the main part.

On Linux, an Inno Setup installer (every GOG offline installer, and most
repacks) runs **unattended** (`/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-`)
into the folder the installer itself defaults to, `C:\GOG Games\<game>` for
GOG. No `/DIR` is passed, so that folder is always one the search looks in.
If the unattended run fails, Hydra repeats it with the installer's own wizard.
**Settings → Proton and Wine → Game setup** turns this off (`silentInstallers`);
other installers always open their wizard. An installer is recognised by the
`Inno Setup Setup Data` marker in the first megabyte of the file
(`src/main/helpers/silent-installer.ts`).

**Running it again.** Game options → Downloads → **Installer** names the
installer file Hydra found in the download folder and offers **Run installer**
(the Install behaviour above), with an arrow for **Install automatically** or
**Open the installer's wizard** whichever way the setting does not pick, and
**Show installer file**.

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

A folder that still holds an installer gets no guess: only the catalogue's
known names can bind an executable there, so a repack's checksum checker or
unpacker (`QuickSFV`, `unarc`) is never taken for the game. Those tools are
also on the guess's skip list.

## Mod downloads

Mods downloaded from Nexus Mods (on a game's Mods page, or with Nexus's Mod
Manager Download button) are rows on this page and in the bottom bar. They
run in the main process, so leaving the Mods page doesn't stop them. A row
says **Waiting for TorBox**, **Downloading** with its progress,
**Installing** (all in **Now**), **Installed** (in **Recent**; in **Needs
you** with **Choose options** when a FOMOD installer waits for options) or
**Failed** with the reason, TorBox's own words when it gave some, and **Try
again** (in **Needs you**). A download Hydra was closed during comes back as
failed. **Cancel** (in ⋮) stops one that is waiting or downloading; **Open
Mods** opens the game's Mods page. See [Mods](mods.md#nexus-mods).

## Background tasks and long jobs

Long actions that are not downloads are rows too: the Steam history import,
the Steam wishlist check, a Floppy library sync or preview, a pull from
Floppy, adding Floppy games to the library, and changes waiting to be sent to
Floppy (a game's change is sent about ten seconds after it happens, so a
burst shows as "N waiting to be sent"). Jobs that keep running when you leave
the page that started them report here as well, in addition to their own
page: Proton installs, bulk RenoDX and OptiScaler, bulk save import, manual
save backup, moving a game's files, and emulator and RetroArch core installs.
Each shows its progress, and a finished one stays in **Recent** with its
result until you clear it. A row's title opens the page that owns the job
(⋮ for the rest). Settings export and import are not listed: they write one
small file. Scheduled runs that changed nothing leave nothing behind. Tasks
live in memory, so finished ones do not survive a restart.

A failed task says why in plain words (Floppy can't be reached, Steam rejected
the key, the Steam profile is private, the service is rate-limiting or had a
server error) and, when it can be run again, has **Try again**. If you dismiss
a failure, scheduled runs that fail the same way stay quiet until one
succeeds or the reason changes; the integration's card in **Settings →
Integrations** still shows it.
