import type {
  ResolvedRestoreTarget,
  SaveImportFileAction,
  SaveImportPreview,
} from "@types";

/** The game already has this file, and its copy is newer than the source's. */
export const isNewerThanSource = (
  target: Pick<
    ResolvedRestoreTarget,
    "action" | "observedLastModifiedAt" | "lastModifiedAt"
  >
) =>
  target.action === "replace" &&
  !!target.observedLastModifiedAt &&
  Date.parse(target.observedLastModifiedAt) > Date.parse(target.lastModifiedAt);

export const toFileAction = (
  target: Pick<
    ResolvedRestoreTarget,
    "action" | "observedLastModifiedAt" | "lastModifiedAt"
  >
): SaveImportFileAction => {
  if (target.action === "skip-identical") return "identical";
  if (isNewerThanSource(target)) return "keep-newer";
  return target.action;
};

/** Files an import would write without being asked to replace newer ones. */
export const countImportableFiles = (preview: SaveImportPreview) =>
  preview.files.filter(
    (file) => file.action === "create" || file.action === "replace"
  ).length;

/**
 * The source to import from when the user does not pick one: of those with
 * something to import, the one whose saves were written last.
 */
export const pickBestPreview = (
  previews: SaveImportPreview[]
): SaveImportPreview | null => {
  const candidates = previews.filter(
    (preview) => countImportableFiles(preview) > 0 || preview.achievements > 0
  );
  const time = (preview: SaveImportPreview) =>
    preview.newestFileAt ? Date.parse(preview.newestFileAt) : 0;
  return candidates.reduce<SaveImportPreview | null>(
    (best, preview) => (!best || time(preview) > time(best) ? preview : best),
    null
  );
};
