# Save sync

Save sync backs up game saves to storage you own and keeps them in step
between devices, without a Hydra account. It uses upstream Hydra's cloud save
system (save detection, automatic sync, restore, conflicts, custom paths) and
only swaps where the snapshots go: Hydra Cloud's servers are replaced by a
folder or an rclone remote.

## Setting it up

**Settings → Cloud**:

- **A folder**: any directory, for example a Syncthing folder, a NAS share or
  a Nextcloud folder. Other devices point at the same folder.
- **An rclone remote**: `remote:path` from your rclone config, for example
  `r2:hydra-saves` or `gdrive:Games/Saves`, which covers Cloudflare R2, S3,
  Google Drive, SFTP, WebDAV and the rest of rclone's backends. Hydra runs the
  `rclone` command with your own config and stores no cloud credentials.
  rclone must be installed (`pacman -S rclone`).

The tab also shows whether rclone is installed, a **Test connection** button
for a remote that is already on, and a **Cloudflare R2 setup guide** (a popup
with the bucket, API token, `rclone.conf` block and check command; the block
sets `no_check_bucket = true`, which a bucket-limited token needs because
Hydra's rclone calls would otherwise try to create the bucket).

**Turn on** writes, reads back and removes a probe file first, so a wrong
path or remote is refused. While save sync is on it replaces Hydra Cloud,
also for signed-in subscribers; **Turn off** goes back to Hydra Cloud (or to
nothing when signed out). Hydra Cloud's legacy (v1) backups stay a signed-in
feature.

## What you get

The same as Hydra Cloud's saves, signed in or not:

- the save widget on a game's page and the **Save sync** manager it opens;
- **Save sync** in a game's options (automatic sync on or off, custom paths);
- saves checked when a game starts and backed up when it closes;
- restore on a new device: a game whose saves exist only in the store is
  "remote ahead" and its saves are written back;
- conflicts: when two devices changed the same save, the second one sees a
  conflict and chooses **keep local** or **keep remote** instead of
  overwriting.

Games need the same as with Hydra Cloud: a Steam or Epic game (or a supported
emulator game) with an executable, and save locations known to the Ludusavi
manifest or added as custom paths.

## How it is stored

Under the chosen location, in `hydra-plus-saves/v1/`:

| Path                                           | Contents                                                 |
| ---------------------------------------------- | -------------------------------------------------------- |
| `blobs/<ab>/<sha256>-<size>`                   | Each file's content, stored once however often it recurs |
| `games/<shop>/<id>/versions/<n>.<device>.json` | The snapshot of version n, written by one device         |
| `devices/<device>.json`                        | What one device knows: playtime, status, wishlist        |

**Two devices never write the same file.** A commit writes the device's own
file for version n, then lists the folder: if another device's file for the
same version is there, it deletes its own and reports a conflict. Because a
write always comes before its own listing, two devices cannot both win, on a
folder or on any rclone remote, with no "create only if absent" needed. In
the rare case that both back out, nothing is lost and the next sync reports a
conflict to resolve (keep local or keep remote). Stores written by earlier
builds (`<n>.json`) are still read. Snapshot ids (`hp1-<shop>-<hex of the id>`)
carry the game, and every restored file is checked against its hash.

Local sync state (what each device last synced) is kept per location, so
switching to another folder or remote starts fresh rather than comparing
against the old one.

## Library sync

Playtime, play status and wishlist sync through the same location (a switch in
**Settings → Cloud → Library sync**, on by default). Each device writes only
its own `devices/<device>.json`; every device reads the others and merges:

- **Playtime** is added up. A device publishes only what it tracked itself
  (`playTimeInMilliseconds`); the others' total is kept apart in
  `syncedPlayTimeInMilliseconds` and added in `getDisplayedPlayTimeInMilliseconds`,
  so nothing is counted twice. The last played date moves forward only.
- **Status and wishlist**: the most recent edit wins. Each local change is
  dated (`playStatusUpdatedAt`, `wishlistedUpdatedAt`, set in
  `game-record-updater-core.ts`); a status cleared on one device clears it
  everywhere if it was the newest edit.
- A wishlisted game another device added appears here as a wish; a wish
  removed elsewhere removes an entry that was only a wish.
- Games only on one machine (custom games) are not synced.

It runs on startup, every 15 minutes, and a few seconds after a change
(game closed, status or wishlist edited). The tab lists the devices that have
synced and when.

Playtime from before sync was on counts as each device's own. If two devices
started from a copy of the same library, that history is counted twice.

## Storage

Saves are kept as versions, and each new version can leave files behind, so
**Settings → Cloud → Storage** shows what the store holds and what a cleanup
would free. A cleanup (automatic once a day, or **Clean up now**):

1. keeps the newest N versions of each game (3, 5, 10, 1 or all; default 5)
   and deletes the older ones, never the newest;
2. deletes files no kept version uses, unless they were uploaded in the last
   24 hours, so a device that has uploaded but not yet committed loses nothing;
3. stops without deleting anything if a kept version cannot be read.

`store-maintenance.ts` has the logic, tested against a folder and a real
rclone backend.

## Known limits

- A device that has never synced a game and finds identical saves in the
  store records no history; if its saves then change before a sync, it
  reports a conflict the first time (keep local or keep remote resolves it).
- Older versions are pruned by the storage cleanup; there is no history view
  to browse them.
- A device removed from the store keeps its playtime in the total until its
  `devices/<device>.json` file is deleted by hand.
- Emulator memory-card saves (Settings → Emulation) still use Hydra Cloud
  only.

## Code

`src/main/services/cloud-save/save-store/`: `backends.ts` (folder and rclone),
`self-hosted-save-store.ts` (the snapshot model, tested in
`self-hosted-save-store.test.ts` against both backends), `layout.ts` (paths),
`store-maintenance.ts` (usage and cleanup), `index.ts` (the active store from
the `saveStore` preference, the device id and the per-location scope id).
Library sync is `src/main/services/cloud-library-sync/`
(`cloud-library-core.ts` is the tested merge).
The Hydra Cloud calls in `upload-local-game-snapshot`,
`create-remote-snapshot-from-local-state`, `list-remote-game-snapshots`,
`resolve-remote-snapshot-targets`, `download-remote-snapshot-to-temp`,
`delete-game-cloud-save-data` and `untrack-cloud-save-custom-path` branch to
the store when one is set; `cloud-save-access.ts` (main and shared) treats a
store as access. The settings tab is `settings-context-cloud.tsx` with `settings-save-sync.tsx`, `settings-cloud-library.tsx` and `settings-cloud-storage.tsx`.
