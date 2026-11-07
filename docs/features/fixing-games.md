# From download to playable, and where fixes go

This is the map for working on the download-to-play pipeline: which code owns
each stage, and, when a game does not work, which kind of fix it needs and
where that fix goes. Read it before adding a hoster, an installer rule or a
patch for a game. Feature docs linked here say what the user sees; this page
says where to change it.

## The pipeline

| Stage                     | What happens                                                                                                                                          | Code                                                                                                                                                                                       | Doc                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 1. Pick a release         | Download options rank the releases (**Recommended**). The download dialog offers the downloaders that accept the links, with TorBox for hoster links. | `src/shared/index.ts` (`getDownloadersForUri`, `selectRepackUris`), `src/shared/torbox-hosters.ts`, `repacks-modal.tsx`, `download-settings-modal.tsx`                                     | [downloads](downloads.md#choosing-a-download)                                     |
| 2. Download               | One downloader per `Downloader` value. Hosters turn a page link into a file URL. Debrid services fetch the file themselves first.                     | `src/main/services/download/download-manager.ts` (`getJsDownloadOptions`), `src/main/services/hosters/`, `download/torbox*.ts`, `real-debrid*.ts`, `src/main/services/ankergames/`         | [downloads](downloads.md), [AnkerGames](ankergames.md)                            |
| 3. Download errors        | Each `DownloadError` value is also its i18n key. Hoster-specific HTTP answers are mapped in one place.                                                | `src/shared/constants.ts` (`DownloadError`), `src/main/helpers/download-error-handler.ts`                                                                                                  |                                                                                   |
| 4. Extract                | 7-Zip, a free-space check first, only changed files when extracting over a copy, known archive passwords.                                             | `game-files-manager.ts` (`extractDownloadedFile`), `archive-extraction.ts` (`ARCHIVE_PASSWORDS`), `delta-extraction.ts`, `download-game-folder.ts`                                         | [downloads](downloads.md#free-space)                                              |
| 5. Installer or game?     | `findGameInstaller` is the one installer check. With an installer, only catalogue names bind an executable; without one, Hydra guesses.               | `src/main/helpers/find-game-installer.ts`, `game-files-manager.ts` (`setExtractionComplete`, `searchAndBindExecutable`)                                                                    | [downloads](downloads.md#finished-downloads)                                      |
| 6. Install                | Runs the installer (unattended for Inno Setup on Linux), then finds the installed game in the prefix.                                                 | `src/main/events/library/open-game-installer.ts`, `src/main/helpers/silent-installer.ts`, `installer-target-directories.ts`, `installed-executable-poller.ts`, `choose-guessed-install.ts` | [downloads](downloads.md#installing)                                              |
| 7. Find the executable    | Catalogue names first, then a guess that skips installers, redistributables, tools and repack checkers.                                               | `src/main/helpers/find-game-executable.ts`, `guess-game-executable.ts` (`NON_GAME_NAME`), `game-executable-ranking.ts`                                                                     | [downloads](downloads.md#executable-after-a-download)                             |
| 8. Set up                 | Ordered steps after install: prefix, OnlineFix, save import, ReShade, RenoDX, OptiScaler, post-install command. Each writes a Setup log line.         | `src/shared/game-setup-steps.ts` (the order), `src/main/services/game-setup/` (one `*-step.ts` per step)                                                                                   | [game setup](game-setup.md)                                                       |
| 9. Launch                 | Hydra's DLL overrides, then launch rules, then the game's own options; launcher redirects; capabilities decide Auto/On/Off tools.                     | `src/main/helpers/launch-additions.ts`, `src/shared/launch-rules.ts`, `src/main/helpers/launcher-redirects.ts`, `src/main/services/capabilities/`                                          | [launch rules](launch-rules.md), [tools](game-tools.md)                           |
| 10. Look at what happened | Every run writes a record an agent can read; the launch preview shows the exact command.                                                              | `<userData>/runs/<game>/latest/summary.md`, `<userData>/logs/`, **Show launch command**                                                                                                    | [game runs](game-runs.md), [launch rules](launch-rules.md#launch-command-preview) |

## A game doesn't work: which fix

Start from the symptom, look at the run record and the Setup log, then pick
the narrowest fix that covers it. Prefer data (a table entry, a preset) over
new code, and a rule every affected game benefits from over a per-game hack.

| Symptom or need                                                                       | Fix                                                                                     | Where                                                                                                                        |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Needs an environment variable, an argument or a wrapper, for games that ship a file X | A built-in launch-rule preset matched by file name                                      | `LAUNCH_RULE_PRESETS` in `src/shared/launch-rules.ts`; existing users get it once through `addNewLaunchRulePresets`          |
| A crack's proxy DLL (`winmm`, `version`, …) must load instead of Wine's               | Extend crack detection: marker files and proxy DLLs                                     | `src/main/services/game-setup/online-fix.ts` (`MARKER_FILES`, `ONLINE_FIX_PROXY_DLLS`), used by `launch-additions.ts`        |
| Files must be copied into the prefix or the game folder once, after install           | A setup step                                                                            | a new `*-step.ts` in `game-setup/`, its id in `GAME_SETUP_STEP_IDS`, `setup_log_<step>_<code>` strings                       |
| A per-game binary patch from the internet (widescreen, FPS unlock)                    | A pinned definition, like the widescreen patch                                          | `src/shared/widescreen-patches.ts`; see [widescreen patch](widescreen-patch.md) for the fields                               |
| The executable is a publisher launcher that then starts the game                      | A launcher redirect                                                                     | `LAUNCHER_REDIRECTS` in `src/main/helpers/launcher-redirects.ts`                                                             |
| The wrong `.exe` was bound (a tool, a checker, a crash handler)                       | Add the name to the guess denylist                                                      | `NON_GAME_NAME` in `src/main/helpers/guess-game-executable.ts`, or the redistributable lists in `game-executable-ranking.ts` |
| An installer is not recognised, or is recognised in an installed game                 | Change the installer name rules                                                         | `INSTALLER_NAME_PATTERNS` in `src/main/helpers/find-game-installer.ts`                                                       |
| An installer type could run unattended                                                | A detector and its silent arguments                                                     | `src/main/helpers/silent-installer.ts` (Inno Setup today)                                                                    |
| An archive needs a password                                                           | Add the site's password                                                                 | `ARCHIVE_PASSWORDS` in `src/main/services/archive-extraction.ts`                                                             |
| A new file host                                                                       | A hoster resolver, a `Downloader` value, its URI prefix, its name, and errors if needed | `src/main/services/hosters/`, `Downloader` and `getOwnDownloadersForUri`, `download-manager.ts`, `DOWNLOADER_NAME`           |
| TorBox should fetch a host's links                                                    | Add the host's prefix                                                                   | `src/shared/torbox-hosters.ts` (check `/webdl/hosters` first)                                                                |
| An AnkerGames archive is not picked up                                                | Archive name matching                                                                   | `matchBrowserDownload` in `src/shared/ankergames.ts`                                                                         |

Things that need the person's own choice (a different Proton, a tool on or
off) belong in the game's options, not in a fix. A fix that is only right for
one machine belongs in the person's own launch rules.

## Each kind of change

- **Tests.** Every table above has tests next to it (`*.test.ts`): add the
  case that failed. Detection and matching code is pure on purpose so a test
  can feed it file names.
- **Strings.** User-facing text goes in `src/locales/en/translation.json`;
  `DownloadError` values are keys in the `downloads` namespace.
- **Docs.** Update the feature doc the table links to, and the ownership
  table in [game page](game-page.md) when a new fact shows up in the UI.
- **Check it.** `npm test`, `npm run typecheck`, then the sandboxed dev
  instance (see `CLAUDE.md`). For launch changes, **Show launch command**
  must show the change; for setup steps, the Setup log must show the new
  line; after a real run, read `summary.md`.

## Known gaps

- Crack detection knows OnlineFix and UnionCrax's UCOnline only. Other Steam
  emulators that need a proxy DLL (RUNE, CODEX, CreamAPI) need a launch rule
  by hand; see [OnlineFix](online-fix.md#steam-emulators-and-protons-steam-bridge).
  Crack detection should become a table of `{markers, proxyDlls, keepSteamBridge}`.
- Hydra's own DLL overrides (OptiScaler, RenoDX, widescreen, mod loader,
  OnlineFix) are listed by hand in `buildLaunchEnvironment`'s caller in
  `launch-additions.ts`; a new tool that needs one is added there.
- Adding a hoster touches several files (the `Downloader` enum, URI prefixes in
  `src/shared/index.ts`, `repack-uri-groups.ts` and `torbox-hosters.ts`, a case
  and a wrapper in `download-manager.ts`, the renderer and Big Picture name
  tables). A single downloader table would make it one entry; much of this is
  upstream code, so it is kept as it is for now to keep merges cheap.
- A wrong archive password only says "Extraction failed"; there is no prompt.
- Only Inno Setup installers run unattended; NSIS (`/S`) and MSI would need a
  detector each and a test with a real installer.
