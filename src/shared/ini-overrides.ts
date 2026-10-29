export interface IniOverride {
  section: string;
  key: string;
  value: string;
}

export interface ParsedIniOverrides {
  overrides: IniOverride[];
  /** 1-based line numbers that are neither a section, a key=value pair nor a comment. */
  invalidLines: number[];
}

/** Parses an INI fragment such as "[Menu]\nShortcutKey=0x78". */
export const parseIniOverrides = (text: string): ParsedIniOverrides => {
  const overrides: IniOverride[] = [];
  const invalidLines: number[] = [];
  let section: string | null = null;

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) return;

    const sectionMatch = /^\[([^\]]+)\]$/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      return;
    }

    const separator = line.indexOf("=");
    const key = separator > 0 ? line.slice(0, separator).trim() : "";
    if (!section || !key) {
      invalidLines.push(index + 1);
      return;
    }

    overrides.push({ section, key, value: line.slice(separator + 1).trim() });
  });

  return { overrides, invalidLines };
};

/**
 * Sets each override in an INI document, replacing the key inside its
 * section when present and adding it (and the section) otherwise. Comments
 * and layout are preserved.
 */
export const applyIniOverrides = (
  document: string,
  overrides: IniOverride[]
): string => {
  const newline = document.includes("\r\n") ? "\r\n" : "\n";
  const lines = document.split(/\r?\n/);

  for (const { section, key, value } of overrides) {
    const sectionStart = lines.findIndex(
      (line) => line.trim().toLowerCase() === `[${section.toLowerCase()}]`
    );

    if (sectionStart === -1) {
      if (lines.length > 0 && lines[lines.length - 1].trim() !== "") {
        lines.push("");
      }
      lines.push(`[${section}]`, `${key}=${value}`);
      continue;
    }

    let sectionEnd = lines.length;
    for (let index = sectionStart + 1; index < lines.length; index++) {
      if (/^\s*\[[^\]]+\]\s*$/.test(lines[index])) {
        sectionEnd = index;
        break;
      }
    }

    const keyPattern = new RegExp(
      `^\\s*${key.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=`,
      "i"
    );
    const keyIndex = lines
      .slice(sectionStart + 1, sectionEnd)
      .findIndex((line) => keyPattern.test(line));

    if (keyIndex !== -1) {
      lines[sectionStart + 1 + keyIndex] = `${key}=${value}`;
      continue;
    }

    let insertAt = sectionEnd;
    while (insertAt > sectionStart + 1 && lines[insertAt - 1].trim() === "") {
      insertAt--;
    }
    lines.splice(insertAt, 0, `${key}=${value}`);
  }

  return lines.join(newline);
};
