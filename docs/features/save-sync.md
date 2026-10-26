# Save sync

Save sync backs up game saves to storage you own and keeps them in step
between devices, without a Hydra account. It uses upstream Hydra's cloud save
system (save detection, automatic sync, restore, conflicts, custom paths) and
only swaps where the snapshots go: Hydra Cloud's servers are replaced by a
folder or an rclone remote.

## Setting it up

**Settings → Saves & achievements → Save sync**:

- **A folder**: any directory, for example a Syncthing folder, a NAS share or
  a Nextcloud folder. Other devices point at the same folder.
- **An rclone remote**: `remote:path` from your rclone config, for example
  `r2:hydra-saves` or `gdrive:Games/Saves`, which covers Cloudflare R2, S3,
  Google Drive, SFTP, WebDAV and the rest of rclone's backends. Hydra runs the
  `rclone` command with your own config and stores no cloud credentials.
  rclone must be installed (`pacman -S rclone`).

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

| Path                                  | Contents                                                 |
| ------------------------------------- | -------------------------------------------------------- |
| `blobs/<ab>/<sha256>-<size>`          | Each file's content, stored once however often it recurs |
| `games/<shop>/<id>/versions/<n>.json` | The snapshot of version n: files, variants, custom paths |
| `games/<shop>/<id>/head.json`         | The current version                                      |

A commit writes version `n + 1` only if it does not exist yet (a hard link on
a folder, a check before writing on rclone), so two devices cannot both claim
the same version; the loser re-reads and reports a conflict. Snapshot ids
(`hp1-<shop>-<hex of the id>`) carry the game, and every restored file is
checked against its hash.

Local sync state (what each device last synced) is kept per location, so
switching to another folder or remote starts fresh rather than comparing
against the old one.

## Known limits

- Older versions and their files are kept; nothing deletes unreferenced
  files yet, so the store only grows.
- A device that has never synced a game and finds identical saves in the
  store records no history; if its saves then change before a sync, it
  reports a conflict the first time (keep local or keep remote resolves it).
- On an rclone remote the "version already exists" check is not atomic; two
  devices committing within the same second could both succeed, and the
  later one wins.
- Emulator memory-card saves (Settings → Emulation) still use Hydra Cloud
  only.

## Code

`src/main/services/cloud-save/save-store/`: `backends.ts` (folder and rclone),
`self-hosted-save-store.ts` (the snapshot model, tested in
`self-hosted-save-store.test.ts` against both backends), `index.ts` (the
active store from the `saveStore` preference and the per-location scope id).
The Hydra Cloud calls in `upload-local-game-snapshot`,
`create-remote-snapshot-from-local-state`, `list-remote-game-snapshots`,
`resolve-remote-snapshot-targets`, `download-remote-snapshot-to-temp`,
`delete-game-cloud-save-data` and `untrack-cloud-save-custom-path` branch to
the store when one is set; `cloud-save-access.ts` (main and shared) treats a
store as access. The settings card is `settings-save-sync.tsx`.
