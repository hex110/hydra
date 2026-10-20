import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, type TestContext } from "node:test";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const code = ts.transpileModule(
  fs.readFileSync(
    new URL("./library-folder-watcher.ts", import.meta.url),
    "utf8"
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }
).outputText;

const requireNode = createRequire(import.meta.url);
const SPEEDUP = 1000;

const waitFor = async (check: () => boolean, timeoutMs = 5000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

function load(t: TestContext, preferences: Record<string, unknown>) {
  const writeListeners: ((ops: { key?: unknown }[]) => void)[] = [];
  const events = { scans: 0, statusChecks: 0 };
  const timers = new Set<NodeJS.Timeout>();
  const exports: Record<string, unknown> = {};

  const stubs: Record<string, unknown> = {
    "@main/level": {
      db: {
        on: (_: string, listener: (ops: { key?: unknown }[]) => void) =>
          writeListeners.push(listener),
        get: async () => preferences,
      },
      levelKeys: { userPreferences: "userPreferences" },
    },
    "./logger": { logger: { info: () => {}, warn: () => {}, error: () => {} } },
    "./executable-status": {
      refreshAllExecutableStatuses: async () => {
        events.statusChecks++;
      },
    },
    "@main/events/library/scan-installed-games": {
      scanLibraryFoldersInBackground: async () => {
        events.scans++;
      },
    },
  };

  runInNewContext(code, {
    exports,
    require: (name: string) => stubs[name] ?? requireNode(name),
    setTimeout: (fn: () => void, ms: number) => {
      const timer = setTimeout(fn, ms / SPEEDUP);
      timers.add(timer);
      return timer;
    },
    clearTimeout: (timer: NodeJS.Timeout) => clearTimeout(timer),
    Promise,
  });

  const Watcher = exports.LibraryFolderWatcher as {
    watch: () => void;
    watchers: Map<string, fs.FSWatcher>;
  };
  t.after(() => {
    timers.forEach(clearTimeout);
    Watcher.watchers.forEach((watcher) => watcher.close());
  });

  return {
    Watcher,
    events,
    changePreferences: (next: Record<string, unknown>) => {
      Object.assign(preferences, next);
      writeListeners.forEach((listener) =>
        listener([{ key: "userPreferences" }])
      );
    },
  };
}

const tempFolder = (t: TestContext) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-watch-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  return folder;
};

describe("LibraryFolderWatcher", () => {
  it("scans once a new game folder stops changing", async (t) => {
    const folder = tempFolder(t);
    const { Watcher, events } = load(t, {
      watchLibraryFolders: true,
      libraryScanDirectories: [folder],
    });
    Watcher.watch();
    await waitFor(() => Watcher.watchers.has(folder));

    const game = path.join(folder, "Some Game");
    fs.mkdirSync(game);
    fs.writeFileSync(path.join(game, "game.exe"), "a");

    // Still copying: the folder keeps growing during the first checks.
    await new Promise((resolve) => setTimeout(resolve, 30));
    fs.writeFileSync(path.join(game, "data.pak"), "more data");
    assert.equal(events.scans, 0);

    await waitFor(() => events.scans === 1);
    assert.equal(events.statusChecks, 1);
  });

  it("watches nothing while the setting is off, and follows changes to it", async (t) => {
    const folder = tempFolder(t);
    const { Watcher, changePreferences } = load(t, {
      watchLibraryFolders: false,
      libraryScanDirectories: [folder],
    });
    Watcher.watch();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(Watcher.watchers.size, 0);

    changePreferences({ watchLibraryFolders: true });
    await waitFor(() => Watcher.watchers.has(folder));

    changePreferences({ libraryScanDirectories: [] });
    await waitFor(() => Watcher.watchers.size === 0);
  });
});
