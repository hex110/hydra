import path from "node:path";

/** PATH with `directory` added at the end, unless it is there already. */
export const appendDirectoryToPath = (
  pathValue: string | undefined,
  directory: string
) => {
  const entries = (pathValue ?? "").split(path.delimiter).filter(Boolean);
  return entries.includes(directory)
    ? entries.join(path.delimiter)
    : [...entries, directory].join(path.delimiter);
};
