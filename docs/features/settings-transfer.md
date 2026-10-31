# Moving settings to another computer

**Settings → General → Move settings to another computer** exports the
settings to a JSON file and imports such a file, for setting up a second
machine (the laptop) without going through every page again.

## What the file holds

All of the preferences: launch rules, tool defaults, library folders, the
default Proton build, download sources' order, integrations (Floppy URL,
SteamID, what to add to the library), cloud save location and the rest.
Games, their prefixes and saves are not in it; saves move through
[Save sync](save-sync.md).

- **Secrets** (every API key and token: Floppy, Steam Web API, SteamGridDB,
  the debrid services) are left out unless **Include API keys and tokens** is
  ticked. The file is written readable by its owner only.
- **Paths** in the home folder are written with `~`, and an import expands
  `~` to the other computer's home folder, so `/home/moonlight/Games` becomes
  `/home/ari/Games`. Other paths (`/mnt/Storage/…`, Proton builds in
  `/usr/share/…`) are kept as they are.
- **Machine-only settings** (the torrent network interface) stay out.

An import goes through the same path as changing a setting by hand, then
reloads the window. Settings the file doesn't mention are left alone.

Code: `src/main/services/settings-transfer/settings-transfer-core.ts` (the
tested file format) and `src/main/events/user-preferences/settings-transfer.ts`
(the dialogs).
