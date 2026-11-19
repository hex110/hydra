export type SteamEmuKind = "RUNE" | "CODEX";

const ACHIEVEMENT_INDEX_SECTION = "SteamAchievements";
const EOL = "\r\n";

const KIND_MARKERS: [string, SteamEmuKind][] = [
  ["\\steam\\rune\\", "RUNE"],
  ["\\steam\\codex\\", "CODEX"],
];

const KIND_FILE_EXTENSIONS: [string, SteamEmuKind][] = [
  [".rne", "RUNE"],
  [".cdx", "CODEX"],
];

interface IniSection {
  name: string;
  lines: string[];
}

const isIgnoredLine = (line: string) =>
  !line || line.startsWith("#") || line.startsWith(";");

const detectKind = (contents: string, siblingFileNames: string[]) => {
  const lowerContents = contents.toLowerCase();

  for (const [marker, kind] of KIND_MARKERS) {
    if (lowerContents.includes(marker)) return kind;
  }

  for (const fileName of siblingFileNames) {
    const lowerFileName = fileName.toLowerCase();

    for (const [extension, kind] of KIND_FILE_EXTENSIONS) {
      if (lowerFileName.endsWith(extension)) return kind;
    }
  }

  return null;
};

const readAppId = (contents: string) => {
  let inSettings = false;

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (isIgnoredLine(line)) continue;

    const section = /^\[(.*)\]$/.exec(line);

    if (section) {
      inSettings = section[1].trim().toLowerCase() === "settings";
      continue;
    }

    if (!inSettings) continue;

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) continue;

    if (line.slice(0, separatorIndex).trim().toLowerCase() !== "appid") {
      continue;
    }

    const value = line.slice(separatorIndex + 1).trim();

    return /^\d+$/.test(value) ? value : null;
  }

  return null;
};

export const parseSteamEmuIni = (
  contents: string,
  siblingFileNames: string[]
): { kind: SteamEmuKind; appId: string | null } | null => {
  const kind = detectKind(contents, siblingFileNames);

  if (!kind) return null;

  return { kind, appId: readAppId(contents) };
};

const parseSections = (contents: string) => {
  const sections: IniSection[] = [];
  let current: IniSection | null = null;

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (isIgnoredLine(line)) continue;

    const header = /^\[(.*)\]$/.exec(line);

    if (header) {
      current = { name: header[1], lines: [] };
      sections.push(current);
    } else {
      current?.lines.push(line);
    }
  }

  return sections;
};

const LOCKED_ACHIEVEMENT_LINES = [
  "Achieved=0",
  "CurProgress=0",
  "MaxProgress=0",
  "UnlockTime=0",
];

/**
 * RUNE and CODEX only know the achievements listed in their file, and Unreal
 * games skip the ones they cannot read, so every achievement has to be listed
 * as locked up front. Returns null when there is nothing to write.
 */
export const mergeEmulatorAchievementList = (
  existing: string | null,
  names: string[]
): string | null => {
  const wantedNames = [...new Set(names.filter((name) => name !== ""))];

  if (!wantedNames.length) return null;

  const achievementSections = parseSections(existing ?? "").filter(
    (section) => section.name !== ACHIEVEMENT_INDEX_SECTION
  );

  const knownNames = new Set(achievementSections.map(({ name }) => name));
  const missingNames = wantedNames.filter((name) => !knownNames.has(name));

  if (!missingNames.length && existing !== null) return null;

  const sections: IniSection[] = [
    ...achievementSections,
    ...missingNames.map((name) => ({ name, lines: LOCKED_ACHIEVEMENT_LINES })),
  ];

  const lines = [
    `[${ACHIEVEMENT_INDEX_SECTION}]`,
    ...sections.map(
      ({ name }, index) => `${String(index).padStart(5, "0")}=${name}`
    ),
    `Count=${sections.length}`,
    "",
    ...sections.flatMap(({ name, lines: sectionLines }) => [
      `[${name}]`,
      ...sectionLines,
      "",
    ]),
  ];

  return lines.join(EOL) + EOL;
};
