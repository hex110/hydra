/**
 * Install instructions read from a mod's description with rules, no AI: the
 * sentences that say where files go ("extract into the game folder, next to
 * Game.exe", "put the .pak in Content/Paks/~mods") and the steps Hydra can't
 * do itself (run an installer, edit an INI, set launch options).
 */

export type InstallHintTarget =
  /** The game folder, where the executable is. */
  | { kind: "game-root" }
  /** A folder relative to the game folder, as the description names it. */
  | { kind: "folder"; path: string }
  /** A folder in the user's profile (Documents, AppData): the Wine prefix. */
  | { kind: "profile"; path: string };

export interface InstallHint {
  target: InstallHintTarget;
  /** The sentence it came from, for the user to check. */
  quote: string;
  /** Strong: an install verb and an explicit place in one sentence. */
  strength: "strong" | "weak";
}

export type InstallNoteKind =
  | "run-program"
  | "edit-ini"
  | "launch-options"
  | "needs-loader";

export interface InstallNote {
  kind: InstallNoteKind;
  quote: string;
}

export interface InstallHints {
  hints: InstallHint[];
  notes: InstallNote[];
}

const MAX_QUOTE = 240;

const INSTALL_VERB =
  /\b(extract|unzip|unpack|unrar|place|put|copy|move|drop|drag|paste|install|overwrite|replace)\w*\b/i;

const LOADER_NAME =
  /\b(BepInEx|MelonLoader|RE-?UE4SS|UE4SS|REFramework|SMAPI|Script Extender|SKSE64|F4SE|Cyber Engine Tweaks|RED4ext|Mod Engine)\b/i;

/** "Install BepInEx by extracting it into the game folder" is about the loader. */
const LOADER_INSTALL =
  /\b(install|extract|unpack|unzip|download|copy)\w*\b[^.\n]{0,40}\b(BepInEx|MelonLoader|RE-?UE4SS|UE4SS|REFramework|SMAPI|Script Extender|SKSE64|F4SE|Cyber Engine Tweaks|RED4ext)\b/i;

const GAME_ROOT = [
  // Only the game's own exe: "next to modengine2_launcher.exe" is a tool's folder.
  /\b(next to|beside|alongside|same (folder|directory|place) as)\s+(the\s+)?(game'?s?\s+)?(exe|executable)\b/i,
  /\b(game'?s?|install(ation)?|main|root|base)\s+(root\s+)?(folder|directory|dir|location)\b/i,
  /\b(root|top)\s+(folder|directory|dir)\s+of\s+(the|your)\s+game\b/i,
  /\bgame[\s_-]?root\b/i,
  /\bbrowse local files\b/i,
];

/** Words after which a path is what the user ends up with, not where to extract. */
const RESULT =
  /\b(ends? up|you (?:will |should )?(?:get|have|see)|should (?:look|be)|will look like|keeping|so that|so you|containing|that (?:has|contains)|the one with|which has)\b/i;

const escapeRegExp = (value: string) =>
  value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "You install it by dropping it into bin", right after "requires Script Extender". */
const PRONOUN_OBJECT =
  /\b(install|drop|place|put|extract|copy|unzip)\w*\s+(it|them)\b/i;

const PROFILE =
  /\b(documents|my documents|appdata|my games|saved games)\b[\\/ ]?([^\s,;"'()]*)/i;

const NOTES: { kind: InstallNoteKind; pattern: RegExp }[] = [
  {
    kind: "run-program",
    pattern:
      /\b(run|launch|execute|start|double[- ]click)\b[^.\n]{0,40}\b(installer|setup|patcher|\.exe|\.bat)\b/i,
  },
  {
    kind: "edit-ini",
    pattern:
      /\b(edit|open|change|modify|set)\b[^.\n]{0,40}\.(ini|cfg|toml|json)\b/i,
  },
  {
    kind: "launch-options",
    pattern: /\b(launch options|WINEDLLOVERRIDES|%command%)\b/i,
  },
  {
    kind: "needs-loader",
    pattern:
      /\b(requires?|needs?|install)\b[^.\n]{0,30}\b(BepInEx|MelonLoader|UE4SS|SMAPI|SKSE|F4SE|REFramework|Script Extender|ASI Loader)\b/i,
  },
];

/** Paths written with slashes, or a quoted or capitalised folder name. */
const PATH_TOKEN =
  /(?:[`"'“”]([^`"'“”\n]{1,120})[`"'“”])|((?:[\w.~+-]+(?: [\w.~+-]+)*[\\/])+[\w.~+-]*)/g;
const NAMED_FOLDER =
  /\b(?:the|your|in|into|to)\s+["'“]?([A-Z~][\w.~+-]*(?:[ /\\][A-Z~][\w.~+-]*)*)["'”]?\s+(?:[Ff]older|[Dd]irectory|[Dd]ir)\b/g;

const normalizePath = (value: string) =>
  value
    .replaceAll("\\", "/")
    .replace(/^\.?\/+/, "")
    .replace(/[.,;:!?)]+$/, "")
    .replace(/\/+$/, "")
    .replaceAll(/\/{2,}/g, "/")
    .trim();

/** Lines of plain text, split further at sentence ends. */
const sentences = (text: string) =>
  text
    // "…install it under:" with the path on the next line.
    .replaceAll(/:[ \t]*\n+[ \t]*(?=\S)/g, ": ")
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z])/))
    .map((line) => line.replace(/^[•*\-\d.)\s]+/, "").trim())
    .filter((line) => line.length > 3);

const quoteOf = (sentence: string) =>
  sentence.length > MAX_QUOTE
    ? `${sentence.slice(0, MAX_QUOTE - 1)}…`
    : sentence;

/** The line holds little besides the path: a label such as "Steam:" at most. */
const isPathLine = (sentence: string, path: string) =>
  sentence
    .replaceAll("\\", "/")
    .replace(path, "")
    .replaceAll(/[\s/:*`"'“”.-]/g, "").length <= 12;

/** Folder candidates a sentence names, as written. */
const pathCandidates = (sentence: string) => {
  const found: string[] = [];
  for (const match of sentence.matchAll(PATH_TOKEN)) {
    const value = (match[1] ?? match[2] ?? "").trim();
    if (
      !value ||
      /^https?:/i.test(value) ||
      /\.(com|org|net|io)\//i.test(value)
    )
      continue;
    if (
      match[1] &&
      !/[\\/]/.test(value) &&
      !/\b(folder|directory)\b/i.test(sentence)
    )
      continue;
    found.push(value);
  }
  for (const match of sentence.matchAll(NAMED_FOLDER)) found.push(match[1]);
  return (
    found
      .map(normalizePath)
      .filter((value) => value.length > 0)
      // A file path's folder: "Mods/Foo.dll" names Mods.
      .map((value) =>
        /\.[a-z0-9]{2,4}$/i.test(value.split("/").at(-1) ?? "") &&
        value.includes("/")
          ? value.split("/").slice(0, -1).join("/")
          : value
      )
      .filter((value) => !/\.[a-z0-9]{2,4}$/i.test(value))
  );
};

/**
 * Where a path written in a description is, relative to the game folder: the
 * part from the first segment the game folder (or a mod type) knows. Paths
 * like `steamapps/common/<Game>/Mods` or `<Game>/BepInEx/plugins` resolve to
 * `Mods` and `BepInEx/plugins`.
 */
export const resolveHintPath = (
  written: string,
  knownFolders: string[],
  gameNames: string[] = []
): string | null => {
  let segments = normalizePath(written).split("/");
  // `…/steamapps/common/<Game>/rest`: the rest is in the game folder.
  const common = segments.findIndex(
    (segment, index) =>
      segment.toLowerCase() === "common" &&
      segments[index - 1]?.toLowerCase() === "steamapps"
  );
  if (common >= 0) {
    segments = segments.slice(common + 2);
    if (segments.length === 0) return "";
  }
  // `<Game>/…` or `ELDEN RING/Game/…`: the game folder's own names lead in.
  const simple = (value: string) =>
    value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  const names = new Set(
    gameNames.map(simple).filter((name) => name.length > 2)
  );
  const leading = segments.findIndex((segment) => !names.has(simple(segment)));
  if (names.size > 0 && leading !== 0) {
    segments = leading < 0 ? [] : segments.slice(leading);
    if (segments.length === 0) return "";
  }
  const known = knownFolders.map((folder) =>
    normalizePath(folder).toLowerCase()
  );
  const tops = new Set(known.map((folder) => folder.split("/")[0]));
  for (let start = 0; start < segments.length; start++) {
    const top = segments[start].toLowerCase();
    if (!tops.has(top)) continue;
    const rest = segments.slice(start);
    // Keep the case the game folder uses for the part it has.
    const match = known.find(
      (folder) => folder === rest.join("/").toLowerCase()
    );
    if (match) {
      const original = knownFolders.find(
        (folder) => normalizePath(folder).toLowerCase() === match
      );
      return normalizePath(original!);
    }
    const prefix = knownFolders
      .map(normalizePath)
      .filter((folder) =>
        rest.join("/").toLowerCase().startsWith(`${folder.toLowerCase()}/`)
      )
      .toSorted((a, b) => b.length - a.length)[0];
    return prefix
      ? [prefix, ...rest.slice(prefix.split("/").length)].join("/")
      : rest.join("/");
  }
  return null;
};

/**
 * Reads where a description says the files go. `knownFolders` are folders the
 * game has or its mod types use, relative to the game folder; a written path
 * counts only from a segment one of them starts with. `gameNames` (the title,
 * the exe's name) make "the Cyberpunk 2077 folder" the game folder.
 */
export const readInstallHints = (
  text: string,
  {
    knownFolders,
    gameNames = [],
  }: { knownFolders: string[]; gameNames?: string[] }
): InstallHints => {
  const exeNames = gameNames
    .map((name) => name.replace(/\.exe$/i, "").trim())
    .filter((name) => name.length > 2)
    .map(
      (name) =>
        new RegExp(
          `\\b(next to|beside|alongside|same (folder|directory|place) as|where|containing|with)\\b[^.\\n]{0,60}?${escapeRegExp(name)}\\.exe\\b`,
          "i"
        )
    );
  const named = gameNames
    .map((name) => name.replace(/\.exe$/i, "").trim())
    .filter((name) => name.length > 2)
    .map(
      (name) =>
        new RegExp(
          `["'“]?${escapeRegExp(name).replaceAll(/[\s:_-]+/g, "[\\s:_-]*")}["'”]?\\s+(install(ation)?\\s+)?(folder|directory|dir)\\b`,
          "i"
        )
    );
  const hints: InstallHint[] = [];
  const notes: InstallNote[] = [];
  const seen = new Set<string>();
  const add = (hint: InstallHint) => {
    const key = `${hint.target.kind}:${"path" in hint.target ? hint.target.path.toLowerCase() : ""}`;
    if (seen.has(key)) {
      // Keep the strongest wording of the same place.
      const index = hints.findIndex(
        (item) =>
          `${item.target.kind}:${"path" in item.target ? item.target.path.toLowerCase() : ""}` ===
          key
      );
      if (hint.strength === "strong" && hints[index].strength === "weak")
        hints[index] = hint;
      return;
    }
    seen.add(key);
    hints.push(hint);
  };

  let previousNamedLoader = false;
  for (const sentence of sentences(text)) {
    const verb = INSTALL_VERB.test(sentence);
    const namesLoader = LOADER_NAME.test(sentence);
    const followsLoader = previousNamedLoader;
    previousNamedLoader = namesLoader;
    // "…requires Script Extender. You install it by dropping it into bin":
    // "it" is the loader when it comes before any place in the sentence.
    const pronoun = PRONOUN_OBJECT.exec(sentence);
    const beforePronoun = pronoun ? sentence.slice(0, pronoun.index) : "";
    if (
      pronoun &&
      (followsLoader || LOADER_NAME.test(beforePronoun)) &&
      !/\b(into|folder|directory)\b/i.test(beforePronoun) &&
      !/\b(this|the) mod\b/i.test(sentence)
    )
      continue;
    for (const note of NOTES)
      if (note.pattern.test(sentence))
        notes.push({ kind: note.kind, quote: quoteOf(sentence) });

    const profile = PROFILE.exec(sentence);
    if (verb && profile)
      add({
        target: {
          kind: "profile",
          path: normalizePath(
            `${profile[1]}${profile[2] ? `/${profile[2]}` : ""}`
          ),
        },
        quote: quoteOf(sentence),
        strength: "strong",
      });

    // Only the part before "so you get …" says what is being installed, and
    // "the BepInEx included file" or "the reframework folder" is this mod.
    const instruction = sentence.split(RESULT)[0];
    const aboutLoader = LOADER_INSTALL.exec(instruction);
    if (
      aboutLoader &&
      !/\b(this|the) mod\b/i.test(instruction) &&
      !/^[\s-]+(included|bundled|version|folder|directory)\b/i.test(
        instruction.slice(aboutLoader.index + aboutLoader[0].length)
      )
    )
      continue;

    // "Extract into the game folder, so you end up with BepInEx/plugins/X":
    // the path after "end up" is the result; the game folder is the target.
    const result = RESULT.exec(sentence);
    const before = result ? sentence.slice(0, result.index) : sentence;
    const isGameRoot = (part: string) =>
      !PROFILE.test(part) &&
      (GAME_ROOT.some((pattern) => pattern.test(part)) ||
        named.some((pattern) => pattern.test(part)) ||
        exeNames.some((pattern) => pattern.test(part)));

    let placed = false;
    if (!(result && isGameRoot(before))) {
      for (const candidate of pathCandidates(before)) {
        const resolved = resolveHintPath(candidate, knownFolders, gameNames);
        if (resolved === null) continue;
        add({
          // `steamapps/common/<Game>` itself is the game folder.
          target:
            resolved === ""
              ? { kind: "game-root" }
              : { kind: "folder", path: resolved },
          quote: quoteOf(sentence),
          // A line that is just the path ("Steam: Pal/Content/Paks/~mods").
          strength: verb || isPathLine(sentence, candidate) ? "strong" : "weak",
        });
        placed = true;
      }
    }
    if (!placed && isGameRoot(before))
      add({
        target: { kind: "game-root" },
        quote: quoteOf(sentence),
        strength: verb ? "strong" : "weak",
      });
  }
  return {
    hints: hints.toSorted(
      (a, b) =>
        (a.strength === "strong" ? 0 : 1) - (b.strength === "strong" ? 0 : 1)
    ),
    notes,
  };
};

/** The place a description points to most clearly, relative to the game folder. */
export const bestInstallTarget = (hints: InstallHints): string | null => {
  const best = hints.hints.find(
    (hint) => hint.strength === "strong" && hint.target.kind !== "profile"
  );
  if (!best) return null;
  return best.target.kind === "game-root"
    ? ""
    : (best.target as { path: string }).path;
};
