# Downloads page redesign: spec and plan

Written 2026-11-06 with the owner. This is the document to start from when
implementing roadmap phase 23 (**Downloads: one activity list**). It says
what to change, in which order, what the owner decided, what was checked,
and how to check each step. Steps are written to be implemented one at a
time by an agent that has not seen the conversation they came from; files,
functions and events named here were checked on 2026-11-06.

- What exists: [Downloads and extraction](features/downloads.md),
  [Game updates](features/updates.md), [Mods → Nexus Mods](features/mods.md#nexus-mods),
  [Floppy](features/floppy.md), [Steam history](features/steam-history.md)
  and the ownership table in [Game page](features/game-page.md).
- The rules every step follows: `CLAUDE.md` (worktrees, UI consistency, i18n,
  logger, commit per logical change) and the [Principles](roadmap.md#principles).

## Goal

The Downloads page grew one section per feature: background tasks, Steam
installs, mod downloads, game updates, then the game downloads (in progress,
queued, completed). Each section has its own progress bar, its own way of
dismissing a row and its own mix of icon and text buttons. Only one list
can be cleared in bulk. The bottom bar knows about some of this work and not
the rest, and several long jobs (Proton installs, bulk RenoDX/OptiScaler,
save import, settings import/export, …) show progress only on the settings
page that started them, so leaving the page loses sight of them.

After phase 23:

- The page is organised by **state**, as Steam's is, not by which feature
  started the work: **Now**, **Up next**, **Needs you**, **Recent**.
- Every row, whatever its source, is the same `ActivityRow` with the same
  slots, the same progress bar and the same action rules.
- The bottom bar is a one-line "what's happening now" for all of it, with a
  thin progress bar, "+N more" and an attention marker, and opens Downloads.
- Long jobs started elsewhere also appear on the page, so they can be
  followed from anywhere.

## Owner decisions (2026-11-06)

1. **Group by state** into Now / Up next / Needs you / Recent (the
   recommendation in "Target design" below was accepted as written).
2. **Recent keeps finished background tasks** ("Floppy sync: 12 added"),
   mixed with completed downloads and installed mods, newest first.
3. **Updates stay on the Downloads page** (in **Needs you**), as Steam lists
   them in its downloads, and keep appearing on the game page (hero update
   chip) and the home page (**Updates available** shelf). The Downloads page
   becomes the home of "the list of available updates"; the other two are
   summaries that link to it or to the game (see Step 7).
4. **One action language**: ✕ in the rightmost slot clears or ignores, one
   primary button for the obvious next step, everything else in ⋮.
5. **Bottom bar**: one line, highest-priority activity, thin bar, "+N more",
   attention marker. No popover for now (one home per fact); it can be added
   later on top of the same data.
6. **Jobs that outlive their page belong here**: anything that takes more
   than a few seconds and keeps running when you leave the page that started
   it.

## What is there today (checked 2026-11-06)

`src/renderer/src/pages/downloads/downloads.tsx` renders, top to bottom:

| Section (component)                                                 | Progress                                                      | Dismiss                              | Other actions                                        | Bulk clear    |
| ------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------- | ------------- |
| Background tasks (`background-tasks-section.tsx`)                   | native `<progress>` (`background-tasks__progress`)            | bare ✕ (`background-tasks__dismiss`) | **Try again** outline button                         | no            |
| Downloading through Steam (`steam-downloads-section.tsx`)           | native `<progress>`, same SCSS                                | bare ✕, only while `waiting`         | **Open game**, **Open Steam** outline buttons        | no            |
| Mod downloads (`mod-downloads-section.tsx`)                         | native `<progress>`, same SCSS                                | bare ✕ on done/failed                | **Open Mods**, **Cancel**, **Retry** outline buttons | no            |
| Game updates (`game-updates-section.tsx`)                           | none; always rendered, even with nothing to update            | **Ignore** text button               | **Update** primary, **Check for updates** in header  | no            |
| Download in progress (`download-group.tsx`, hero)                   | large custom bar, speed chart, glass buttons                  | ⊗ (`XCircleIcon`) cancel             | pause/resume, columns icon                           | —             |
| Queued (`download-group.tsx`, simple list)                          | small custom bar, fill is an inline `backgroundColor: "#fff"` | in ⋮                                 | resume icon button, ⋮                                | no            |
| Completed (`download-group.tsx` + `completed-download-actions.tsx`) | none                                                          | ✕ inside an outline `Button`         | Play/Extract/Install/Open folder, ⋮                  | **Clear all** |

Other findings:

- **The bottom bar** (`components/bottom-panel/bottom-panel.tsx`, the
  `status` memo) covers common redist installs, extraction, the active game
  download and mod downloads. It ignores Steam installs
  (`useSteamDownloads`) and background tasks, so a running Floppy sync shows
  "No downloads in progress".
- **Empty state**: `downloads.tsx` shows "No downloads yet" when there are no
  game, mod or Steam downloads, even under a running background task.
- **Background tasks are keyed by kind** (`src/main/services/background-tasks.ts`,
  `Map<BackgroundTaskKind, BackgroundTask>`): one task per kind, kept in
  memory only (gone after a restart). Retry exists only where a service
  called `registerBackgroundTaskRetry`. Kinds today: `steam-history`,
  `steam-wishlist`, `floppy-sync`, `floppy-pull`, `floppy-import`,
  `floppy-push` (`src/types/background-tasks.types.ts`).
- **Mod downloads** are persisted (a download Hydra was closed during comes
  back as failed). States: `waiting-torbox`, `downloading`, `installing`,
  `done` (with `waitsForOptions` for FOMOD), `failed`.
- **Steam installs** (`src/types/steam-install.types.ts`): `waiting`,
  `queued`, `downloading`, `paused`, `finishing`; Hydra only watches them.
- **Game download buckets** come from `getRendererDownloadBucket`
  (`src/types/download-contract.ts`): `inProgress`, `queued`, `complete`,
  `hidden`. Completed rows can carry an extraction failure
  (`download.extractionFailed`, `extractionFailure`) or an Epic error
  (`download.status === "error"`).
- **Long jobs with page-local progress only** (preload events and their one
  consumer):

  | Job                    | Event                                          | Main service                                     | Shown only on                  |
  | ---------------------- | ---------------------------------------------- | ------------------------------------------------ | ------------------------------ |
  | Proton install         | `onProtonInstallProgress`, `onInstallProgress` | `services/proton-manager.ts`                     | Settings → Proton manager      |
  | Bulk RenoDX            | `onRenoDxBulkProgress`                         | `services/renodx/renodx.ts`                      | Settings → Games, bulk actions |
  | Bulk OptiScaler        | `onOptiScalerBulkProgress`                     | `services/optiscaler/optiscaler.ts`              | Settings → Games, bulk actions |
  | Save import (bulk)     | `onSaveImportBulkProgress`                     | `services/save-import/save-import.ts`            | Settings → Save import         |
  | Manual save backup     | `onManualSaveBackupProgress`                   | `services/cloud-save/manual-backup.ts`           | Settings → Cloud save backup   |
  | Emulator install       | `onEmulatorInstallProgress`                    | `services/emulators/emulator-installer.ts`       | Emulation setup                |
  | RetroArch core install | `onRetroArchCoreInstallProgress`               | `services/retroarch/retroarch-core-installer.ts` | RetroArch detail               |
  | Epic sync              | `onEpicSyncProgress`                           | Epic services                                    | Settings → Epic                |
  | Settings export/import | none (a promise)                               | `services/settings-transfer/`                    | Settings → Transfer            |
  | Moving game files      | none found                                     | `events/library/transfer-game-files.ts`          | the game's options             |

  Classics and RetroArch library scans already have their own floating
  indicators (`classics-scan-indicator`, `retroarch-scan-indicator`); leave
  them. Launch preflight (`onPreflightProgress`) is part of launching and
  stays on the hero.

- **Tests** run with `node --test` over `src/**/*.test.ts`: pure TypeScript
  only, no component tests. Put the logic that decides sections, order and
  text in plain `.ts` modules so it can be tested.

## Target design

### Sections

Shown top to bottom. A section with nothing in it is not rendered. The page
header holds the title, **Check for updates** (with "Checked <time ago>" when
known) and nothing else.

1. **Now**: work that is moving.
   - The active Hydra game download keeps the **hero card** (art, big bar,
     speed chart, stats). It is the best part of today's page. Its bar is the
     shared `ProgressBar` (size `large`), not a private one.
   - Everything else that is running is an `ActivityRow` below the hero:
     extraction of another game, Steam installs that are `downloading` or
     `finishing`, mod downloads `waiting-torbox`/`downloading`/`installing`,
     background tasks `running`.
   - With no Hydra download active, the hero is not shown; the rows stand on
     their own. (A Steam install does not get the hero: there is no speed
     history for it. Revisit if the owner asks.)
2. **Up next**: queued and paused game downloads (keeping today's queue
   order and the ⋮ **Move up** / **Move down** items, from `layoutState`), Steam installs
   `waiting`/`queued`/`paused`, background tasks `queued` (Floppy push
   "N waiting to be sent").
3. **Needs you**: things only the user can move on.
   - Available updates (today's `GameUpdatesSection` data), sorted by title.
   - Failed jobs of every kind: background tasks `failed`, mod downloads
     `failed`, completed game downloads whose extraction failed, Epic
     downloads in `error`.
   - Mod downloads `done` with `waitsForOptions` (FOMOD waiting).
   - Header shows a count. No **Clear all** here: each row is a decision.
4. **Recent**: finished work, newest first by finish time, mixed across
   kinds: completed game downloads (including seeding ones), installed mods,
   finished background tasks with their result text, finished Steam installs
   if they are listed today. **Clear all** in the header clears every row
   that can be cleared (game downloads via today's `dismissDownloads` +
   `canDismiss`, done background tasks via `dismissBackgroundTask`, done mod
   downloads via `dismissModDownload`). Finished background tasks are kept
   in memory as today, so they do not survive a restart; that is accepted.

Empty page (all four empty): today's "No downloads yet" state, unchanged.

### The row

One component, `ActivityRow`, in `src/renderer/src/components/activity-row/`.
Slots, left to right:

```
[thumb | icon]  Title                     kind badge     [primary] [⋮] [✕]
                Status line (one line, ellipsis, full text in title attr)
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  42 %
```

- **Thumb**: the game's cover when the row is about a game (downloads, Steam
  installs, mod downloads, updates); an Octicon in the same box otherwise
  (`SyncIcon` for sync tasks, `PackageIcon` for installs, …). Thumb and
  title open the game page when there is a game, the owning page otherwise.
- **Kind badge**: the existing `Badge`: downloader name for game downloads
  (today's `DOWNLOADER_NAME`), "Steam", "Mod", "Update", "Floppy",
  "Steam history", "Proton", … Keeps rows from different sources
  recognisable without separate sections.
- **Status line**: reuse today's text helpers (`useSteamDownloadText`,
  `useModDownloadText`, the background task `detail()`, `useTaskErrorMessage`,
  `getExtractionFailureText`, the Epic error key). Failures use the
  existing error colour token; nothing else is coloured.
- **Progress bar**: the shared `ProgressBar` (Step 1), shown while running or
  queued with a known fraction; **indeterminate** while waiting/starting
  (`waiting-torbox`, task `total === null`, Steam `progress === null`).
  Percentage at the right end when known.
- **Actions**: see the next table. At most one primary button.

### Action rules

| Intent                                                                                                            | Control                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Hide a finished or failed row                                                                                     | ✕ icon button (`XIcon`, ghost style), always the rightmost slot, tooltip **Clear**                                                        |
| Ignore an update                                                                                                  | The same ✕ in the same slot, tooltip **Ignore this version** (calls `dismissGameUpdate`)                                                  |
| The obvious next step                                                                                             | The one primary button: **Play** / **Extract files** / **Install** / **Update** / **Try again** / **Resume** / **Choose options** (FOMOD) |
| Stop something running                                                                                            | **Cancel** in ⋮; the hero keeps its ⊗ and pause buttons                                                                                   |
| Go somewhere (Open game, Open Mods, Open Steam, Open folder when it is not the primary, the owning settings page) | ⋮ items                                                                                                                                   |
| Game-specific management                                                                                          | ⋮ shows today's game context menu items for game downloads (seeding, Manage game, Remove files)                                           |
| Bulk                                                                                                              | **Clear all** on Recent only                                                                                                              |

Rules that follow: no outline text buttons in rows besides the primary; an
action that cannot apply is absent, not disabled; rows that can't be cleared
(seeding, extracting, running) have no ✕ and the slot stays reserved so
columns line up.

### The bottom bar

`bottom-panel.tsx` keeps its layout (help left, status centre, version
right). The centre becomes:

```
Downloading Hollow Knight · 42 % · 12 MB/s · 4 min   +2 more   ● 1 needs you
━━━━━━━━━━━━━━━━━━━━━━━  (thin bar under the text, 2 px)
```

- The text is the highest-priority item of **Now**, in this order: common
  redist install → extraction → active game download (today's
  recovering/reconnecting/checking/metadata/ETA texts) → Steam install →
  mod download → running background task. Then, if Now is empty, the first
  of Up next as "Paused: …"/"Queued: …"; else "No downloads in progress".
- **+N more**: the number of other items in Now.
- **● N needs you**: failures and FOMOD waits only, not updates (an update
  count would be on all the time). Uses the error token for the dot.
- The thin bar is the same `ProgressBar` (size `thin`), indeterminate when
  the item has no fraction, hidden when nothing is running.
- The whole centre is one button that opens `/downloads`, as today.
- It respects `prefers-reduced-motion` (no indeterminate animation then;
  show a static partial bar).

## Data model

One renderer-side shape that every source is turned into, so the page and
the bottom bar read the same list.

```ts
// src/renderer/src/features/activity/activity.types.ts
export type ActivitySection = "now" | "upNext" | "needsYou" | "recent";
export type ActivityKind =
  | "game-download"
  | "steam-install"
  | "mod-download"
  | "game-update"
  | "task";

export interface ActivityItem {
  key: string; // stable: `${kind}:${id}`
  kind: ActivityKind;
  section: ActivitySection;
  title: string;
  game: {
    shop: GameShop;
    objectId: string;
    title: string;
    coverUrl: string | null;
  } | null;
  badge: string; // already translated
  status: string; // already translated, one line
  isError: boolean;
  progress: number | null; // 0–1; null = indeterminate (when `showProgress`)
  showProgress: boolean;
  sortTime: number; // finish time for recent, start/queue time otherwise
  bottomBarPriority: number; // lower first; only used for "now"
  canClear: boolean;
}
```

- **Adapters**, one per source, pure functions in
  `src/renderer/src/features/activity/`: `fromGameDownload`,
  `fromSteamDownload`, `fromModDownload`, `fromGameUpdate`,
  `fromBackgroundTask`. They take the source object plus a `t` function (or
  pre-built strings) and return an `ActivityItem`. Section rules are the ones
  under "Sections" above.
- **Actions are not in the item** (functions don't belong in tested data):
  the page renders each kind's actions from the source object, through a
  small per-kind component (`GameDownloadActions` reuses
  `CompletedDownloadActions` and today's queued/menu logic;
  `ModDownloadActions`, `TaskActions`, …), each filling the primary / ⋮ / ✕
  slots of `ActivityRow`.
- **`useActivity()`** hook in `src/renderer/src/hooks/` gathers the sources
  (`useLibrary`, `useDownload`, `useAppSelector` extraction,
  `useSteamDownloads`, `useModDownloads`, background tasks via
  `getBackgroundTasks`/`onBackgroundTasksChanged`, updates from the full
  library when `checkGameUpdates !== false`), runs the adapters and returns
  `{ now, upNext, needsYou, recent }` sorted. The background task
  subscription moves out of `BackgroundTasksSection` into a shared hook
  (`useBackgroundTasks`) so the page and the bottom bar don't each poll.
- **`selectBottomBarStatus(activity)`**: pure, picks the item and the counts
  for the bottom bar.

## Work, in order

Each step is one or more commits, in the repo's style
(`feat(downloads): …`, `refactor(downloads): …`). Build and install only at
the end of the phase (or when the owner asks to try a step).

### Step 1. Shared progress bar and row primitives

- Extend `components/progress-bar/progress-bar.tsx` (today it takes
  `now/max/label/completed` and two class names, and is used by
  achievements) with a styled default: `size: "thin" | "small" | "large"`,
  `indeterminate`, `tone: "default" | "extraction" | "error"`. Keep today's
  props working for achievements. Fill colour from palette tokens
  (`var(--hydra-accent, …)`), track from an existing token; add tokens to
  `globals.scss` if missing. Indeterminate animation is a `transform` on an
  inner element, gated by `prefers-reduced-motion`; no animation inside
  `overflow: hidden` + `backdrop-filter` panels (the hero has a backdrop:
  check for stale paint on Linux).
- Add `components/activity-row/` (`activity-row.tsx`, `.scss`) with the
  slots above as props (`thumb`, `title`, `onOpen`, `badge`, `status`,
  `isError`, `progress`, `showProgress`, `primary`, `menu`, `onClear`,
  `clearLabel`). Export both from `components/index.ts`.
- Move the three `background-tasks__*` sections (background tasks, Steam,
  mods) onto `ActivityRow` without regrouping yet; delete
  `background-tasks-section.scss` when nothing imports it.
- Replace the hero's and the queued list's private bars with `ProgressBar`;
  remove the inline `backgroundColor: "#fff"`.
- **Check**: the page looks the same apart from bars and rows matching; a
  Floppy or Steam history task, a queued download and the hero all show the
  same bar style at a narrow and a wide window.

### Step 2. Action rules

- Apply the action table to every row type: Completed's ✕ loses its outline
  `Button` wrapper; Updates' **Ignore** becomes the ✕ with tooltip
  **Ignore this version**; Steam's **Open game**/**Open Steam** and mods'
  **Open Mods** move into ⋮; mods' **Cancel** moves into ⋮; Retry becomes the
  primary **Try again** everywhere (same i18n key across namespaces, see
  i18n below).
- Fix the empty state: it shows only when no section has anything,
  background tasks included.
- `GameUpdatesSection` renders nothing when there are no updates; **Check for
  updates** moves to the page header (Step 3 finishes this).
- **Check**: every row type has at most one primary button, ✕ is in the same
  column on every row, tooltips are translated.

### Step 3. The activity model and the four sections

- Add `src/renderer/src/features/activity/` (types, adapters,
  `groupActivity`, `selectBottomBarStatus`) with tests
  (`activity.test.ts`): every state of every source lands in the section the
  table above says; Recent order mixes kinds by finish time; Up next keeps
  `layoutState.queueOrder` then `pausedOrder` then timestamp (lift today's
  sort out of `downloads.tsx` into the module and test it); `canClear` matches
  today's `canDismiss` (seeding and extracting can't be cleared).
- Add `useBackgroundTasks` and `useActivity`.
- Rewrite `downloads.tsx` as: header (title, Check for updates, "Checked …"),
  then `ActivitySection` × 4, each a list of `ActivityRow`s, with the hero
  at the top of Now. Reuse `DownloadGroup`'s modals (pause warning, cancel
  with **Keep the downloaded files**, archive deletion error, binary not
  found) by moving them into the page or a `useGameDownloadActions` hook;
  `download-group.tsx` (1378 lines) should end up as the hero plus the
  game-download action pieces, not a list renderer.
- Section headers: one heading style (`h2` + count chip, as today's
  Completed), Clear all only on Recent.
- "Checked <time ago>": the main process doesn't store when updates were
  last checked (no field found). Add one (timestamp written when
  `checkGameUpdates` finishes, exposed with `isCheckingGameUpdates` or a new
  getter); show it next to the button. Skip the label if this grows beyond a
  small change, and note it in Open questions.
- Delete the per-source section components once nothing uses them
  (`background-tasks-section.tsx`, `steam-downloads-section.tsx`,
  `mod-downloads-section.tsx`, `game-updates-section.tsx` and their SCSS).
- **Check**: tests pass; in the sandbox, a paused download sits in Up next
  with its queue order, a failed Floppy task and an extraction failure sit
  in Needs you with **Try again** / **Extract files**, a finished task and a
  completed download share Recent in time order, and Clear all empties
  Recent except seeding rows.

### Step 4. Bottom bar

- `bottom-panel.tsx` reads `useActivity()` and `selectBottomBarStatus`
  instead of its own `status` memo; keep the common redist listener (it is
  not in the activity list; feed it in as the top-priority item from the
  bottom panel or make it an activity source, either is fine).
- Add the thin bar, "+N more" and "● N needs you" with translated strings
  (`bottom_panel` namespace, pluralised with i18next `_one`/`_other`).
- Tests for `selectBottomBarStatus`: priority order, +N counting, attention
  count ignores updates, empty text.
- **Check**: with a Floppy sync running and nothing else, the bar names it;
  with a game download and a mod download, it names the game and shows
  "+1 more"; with a failed task only, it shows "No downloads in progress"
  and "● 1 needs you".

### Step 5. Jobs that outlive their page

Main-process work; one commit per job.

- Generalise background tasks so one kind can have several entries:
  `BackgroundTask` gains `key: string` (the map key; `id` stays the kind, so
  today's six keep `key === id`), optional `params: Record<string, string>`
  for the title (e.g. `{ version: "GE-Proton10-4" }`), `retryable: boolean`
  (true when a retry handler is registered), and optional `route: string`
  (the page that owns it, used by ⋮ → Open). Update
  `services/background-tasks.ts`, `events/background-tasks.ts`, preload,
  `declaration.d.ts` and the adapter. Keep the 300 ms throttle.
- Then report these jobs through `updateBackgroundTask` /
  `failBackgroundTask`, **in addition to** their own events (their pages keep
  working unchanged), in this order:
  1. Proton install (`proton-manager.ts`), key per version.
  2. Settings export and import (`settings-transfer/`), indeterminate.
  3. Bulk RenoDX and bulk OptiScaler (`renodx.ts`, `optiscaler.ts`), with
     processed/total.
  4. Save import, bulk (`save-import.ts`).
  5. Moving game files (`events/library/transfer-game-files.ts`), per game.
  6. Manual save backup (`cloud-save/manual-backup.ts`).
  7. Emulator and RetroArch core installs.
     Epic sync last, only if it is long enough to matter (check on a real
     account).
- Each new kind gets `task_<kind>`, `task_<kind>_done` strings and a kind
  badge, and its settings page links to the Downloads row while it runs
  (one home per fact: the page may keep its local progress for the action
  the user just pressed, but the Downloads row is the shared view).
- Error reasons: map each service's errors into `BackgroundTaskError` via
  `describeTaskError`, adding codes only when the existing ones don't fit.
- **Check**: start a Proton install in the sandbox (with `HOME` pointed at a
  scratch folder, see `CLAUDE.md`), leave Settings, and follow it on the
  Downloads page and in the bottom bar to the end; it lands in Recent.

### Step 6. Polish

- Keyboard: rows are reachable with Tab; ⋮ and ✕ have labels; Delete on a
  focused clearable row clears it (optional).
- Long titles ellipsise; the row never wraps the action column under the
  text at the narrowest window width; at narrow widths the kind badge drops
  first, then the status line truncates.
- Loading: before the first `getBackgroundTasks`/library load, render
  nothing rather than the empty state (avoid a flash of "No downloads yet").

### Step 7. Docs

- Rewrite [Downloads and extraction](features/downloads.md): a new "The
  Downloads page" section describing the four sections, the row and the
  action rules; fold **Mod downloads** and **Background tasks** into it;
  keep **Finished downloads** (its button table is still right) under
  Recent/Needs you.
- [Game page](features/game-page.md) ownership table: change the **Mod
  downloads** and **Steam installs** rows to "Downloads page (Now / Up next
  / Needs you / Recent)"; add rows for **Available updates (the list)** →
  Downloads page → Needs you, with the game page hero chip and the home
  **Updates available** shelf as summaries linking to it; **Long-running
  jobs (Proton installs, bulk tools, imports, backups)** → Downloads page,
  the settings pages link there; **Bottom bar status** → summary of
  Downloads → Now.
- Add `ActivityRow` and `ProgressBar` to "Patterns across pages" in
  `game-page.md`.
- [Game updates](features/updates.md): say where the list now lives.
- Roadmap phase 23: tick the steps.

## i18n

- Existing keys move with their text; don't duplicate a string per
  namespace. Shared row words (**Clear**, **Try again**, **Cancel**,
  **Open game**) go in `downloads`; mod-specific text stays in `mods`.
- New keys (at least): section titles `activity_now`, `activity_up_next`,
  `activity_needs_you`, `activity_recent`; `clear`, `ignore_this_version`,
  `checked_ago`; badge names per kind; bottom bar `more_count_one/_other`,
  `needs_you_count_one/_other`.
- Only `src/locales/en/translation.json` needs new keys (upstream rule);
  remove keys that are no longer used from `en` when a component is deleted.

## Checking

Sandbox per `CLAUDE.md` → Dev testing, with its own `--remoteDebuggingPort`
and a sandbox folder of its own (not under `/tmp` if a library scan could
run). To reach the states without real downloads:

- **Completed and queued rows**: seed the sandbox with a copy of `hydra-db`,
  delete the `auth`/`user` keys, turn `scanLibraryOnStartup` off, and delete
  the `!downloads!` keys of **unfinished** downloads only (they resume into
  the real folder otherwise); completed ones are safe and give Recent rows.
  Pause a fresh small download to get an Up next row.
- **Failed background task**: point Floppy at an unreachable URL in the
  sandbox and run a sync ("Floppy can't be reached", with **Try again**), or
  give Steam history a wrong key.
- **Finished background task**: a Floppy preview (dry run) or a Steam
  wishlist check.
- **Mod download**: needs TorBox; the Mods phase 19 sandbox recipe in memory
  (`hydra-mods-phase-19`) covers it. If unavailable, rely on the adapter
  tests and say so.
- **Steam install**: needs Steam running; same fallback.

At each step look at the page at a narrow and a wide window, in both the
stock palette and a matugen palette, and check the hero for stale paint
around the progress bar while it moves.

Before finishing: `npm run typecheck`, `npm run lint`, `npm test`, then
`scripts/build-install.sh` (the app changed).

## Out of scope

- A popover or mini panel from the bottom bar (decision 5).
- Persisting finished background tasks across restarts (decision 2 accepts
  that they are session-only).
- Changing what the hero shows, the queue ordering or download
  speed limits.
- The classics/RetroArch scan indicators and launch preflight.

## Open questions

- Steam installs with no Hydra download active: should they take the hero?
  This plan says no (no speed history); ask the owner after Step 3 if it
  looks empty.
- Should Recent cap its length (e.g. 50 rows, older ones behind "Show
  more")? Decide after seeing a real library in Step 3.
