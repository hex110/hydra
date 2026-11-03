import type { TFunction } from "i18next";
import { MINIMUM_FREE_DISK_SPACE_BYTES, formatBytes } from "@shared";
import type { ExtractionFailure } from "@types";

/** The title and explanation for why an extraction failed, shared by the toast and the Downloads row. */
export const getExtractionFailureText = (
  t: TFunction,
  failure: ExtractionFailure | null | undefined
): { title: string; description: string } => {
  switch (failure?.reason) {
    case "unsupported-format":
      return {
        title: t("extraction_unsupported_format_title", { ns: "downloads" }),
        description: t("extraction_unsupported_format_description", {
          ns: "downloads",
          format: failure.format,
        }),
      };
    case "not-enough-space":
      return {
        title: t("extraction_not_enough_space_title", { ns: "downloads" }),
        description: t("extraction_not_enough_space_description", {
          ns: "downloads",
          required: formatBytes(failure.required),
          available: formatBytes(failure.available),
          missing: formatBytes(
            Math.max(
              failure.required +
                MINIMUM_FREE_DISK_SPACE_BYTES -
                failure.available,
              0
            )
          ),
        }),
      };
    case "file-not-found":
      return {
        title: t("extraction_file_not_found_title", { ns: "downloads" }),
        description: t("extraction_file_not_found_description", {
          ns: "downloads",
        }),
      };
    default:
      return {
        title: t("extraction_failed_title", { ns: "downloads" }),
        description: t("extraction_failed_description", { ns: "downloads" }),
      };
  }
};
