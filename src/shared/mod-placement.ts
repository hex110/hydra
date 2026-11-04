import type {
  ModPlacementChoice,
  ModPlacementEntry,
  ModPlacementUncertainty,
} from "../types/mods.types.js";

const normalize = (filePath: string) =>
  filePath.replaceAll("\\", "/").replace(/^\.\/+/, "");

/** Files people read, not files a game loads. */
const DOCUMENT = /\.(txt|md|pdf|html?|url|png|jpe?g|gif|webp|bmp)$/i;
const PROGRAM = /\.(exe|bat|cmd|msi|ps1|sh)$/i;

/** The archive's top-level files and folders, with how many files each holds. */
export const listPlacementEntries = (files: string[]): ModPlacementEntry[] => {
  const entries = new Map<string, ModPlacementEntry>();
  for (const file of files.map(normalize)) {
    const [top, ...rest] = file.split("/");
    const entry = entries.get(top) ?? {
      name: top,
      isFolder: rest.length > 0,
      files: 0,
    };
    entry.files += 1;
    entries.set(top, entry);
  }
  return [...entries.values()];
};

/**
 * Where each archive file lands for the chosen places: a folder goes into its
 * target as itself ("folder") or with its contents only ("contents"); a file
 * goes into its target; "skip" leaves an entry out.
 */
export const applyPlacementChoices = (
  files: string[],
  choices: ModPlacementChoice[]
) => {
  const byEntry = new Map(choices.map((choice) => [choice.entry, choice]));
  return files.map(normalize).flatMap((file) => {
    const [top, ...rest] = file.split("/");
    const choice = byEntry.get(top);
    if (!choice || choice.mode === "skip") return [];
    const inner =
      choice.mode === "contents" && rest.length > 0 ? rest.join("/") : file;
    return [
      {
        archive: file,
        target: [choice.target, inner].filter(Boolean).join("/"),
      },
    ];
  });
};

/** The choices that reproduce a planned placement, as a starting point. */
export const choicesFromPlan = (
  plan: { archive: string; target: string }[]
): ModPlacementChoice[] => {
  const choices = new Map<string, ModPlacementChoice>();
  for (const { archive, target } of plan) {
    const [top, ...rest] = normalize(archive).split("/");
    if (choices.has(top)) continue;
    const normalizedTarget = normalize(target);
    if (normalizedTarget.endsWith(normalize(archive))) {
      choices.set(top, {
        entry: top,
        mode: "folder",
        target: normalizedTarget
          .slice(0, -normalize(archive).length)
          .replace(/\/$/, ""),
      });
    } else if (rest.length > 0 && normalizedTarget.endsWith(rest.join("/"))) {
      choices.set(top, {
        entry: top,
        mode: "contents",
        target: normalizedTarget
          .slice(0, -rest.join("/").length)
          .replace(/\/$/, ""),
      });
    } else {
      choices.set(top, { entry: top, mode: "folder", target: "" });
    }
  }
  return [...choices.values()];
};

/**
 * Whether Hydra should ask where a mod goes instead of guessing:
 *
 * - the archive holds a program, which Hydra never runs;
 * - its files would go loose into the game folder and nothing in it matches
 *   a folder or file the game has (the layout guess has nothing to go on);
 * - a game definition routed every loadable file by its default alone.
 */
export const assessPlacement = ({
  files,
  gameRootEntries,
  modFolder,
  plannedTargets,
  recognised,
}: {
  files: string[];
  /** Lower-case names in the game folder. */
  gameRootEntries: Set<string>;
  /** The folder loose files go to; "" for the game folder. */
  modFolder: string;
  plannedTargets: string[];
  /** A game definition recognised at least one file by folder or extension. */
  recognised: boolean | null;
}): ModPlacementUncertainty | null => {
  const normalized = files.map(normalize);
  const programs = normalized.filter((file) => PROGRAM.test(file));
  if (programs.length > 0)
    return { reason: "contains-program", files: programs.slice(0, 10) };

  if (recognised === false) return { reason: "nothing-recognised", files: [] };

  if (recognised === null && modFolder === "") {
    const matches = plannedTargets.some((target) => {
      const [top, ...rest] = normalize(target).split("/");
      return rest.length > 0 && gameRootEntries.has(top.toLowerCase());
    });
    const replaces = plannedTargets.some(
      (target) =>
        !target.includes("/") &&
        gameRootEntries.has(target.toLowerCase()) &&
        !DOCUMENT.test(target)
    );
    if (!matches && !replaces)
      return { reason: "loose-in-game-folder", files: [] };
  }
  return null;
};

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/** A Nexus description (BBCode mixed with HTML) as plain text to read. */
export const nexusDescriptionToText = (description: string) =>
  description
    .replaceAll(/<br\s*\/?>\s*\n?/gi, "\n")
    .replaceAll(/\[\*\]/g, "• ")
    .replaceAll(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, "$2 ($1)")
    .replaceAll(/\[img\][\s\S]*?\[\/img\]/gi, "")
    .replaceAll(/\[\/?[a-z*]+(=[^\]]*)?\]/gi, "")
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll(
      /&(amp|lt|gt|quot|#39|apos|nbsp);/g,
      (entity) => ENTITIES[entity]
    )
    .replaceAll(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replaceAll(/&#x([\da-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replaceAll(/[ \t]+\n/g, "\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
