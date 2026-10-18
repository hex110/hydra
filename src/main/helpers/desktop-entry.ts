/** Quotes one Exec argument as the Desktop Entry specification requires. */
const quoteExecArgument = (value: string) =>
  `"${value.replaceAll(/(["`$\\])/g, String.raw`\$1`)}"`;

/** Escapes a value for a desktop entry's string fields. */
const escapeValue = (value: string) =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", String.raw`\n`)
    .replaceAll("\r", String.raw`\r`)
    .replaceAll("\t", String.raw`\t`);

export interface DesktopEntry {
  name: string;
  command: string[];
  iconPath: string | null;
}

export const renderDesktopEntry = ({
  name,
  command,
  iconPath,
}: DesktopEntry) => {
  const exec = command
    .map(quoteExecArgument)
    .join(" ")
    // A literal percent sign is written %% so it is not read as a field code.
    .replaceAll("%", "%%");

  const lines = [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${escapeValue(name)}`,
    `Exec=${escapeValue(exec)}`,
    ...(iconPath ? [`Icon=${escapeValue(iconPath)}`] : []),
    "Terminal=false",
    "Categories=Game;",
  ];

  return `${lines.join("\n")}\n`;
};

/** A file name that stays valid whatever characters the object id holds. */
export const desktopEntryFileName = (
  prefix: string,
  shop: string,
  objectId: string
) => `${prefix}${shop}-${objectId.replaceAll(/[^\w.-]/g, "_")}.desktop`;
