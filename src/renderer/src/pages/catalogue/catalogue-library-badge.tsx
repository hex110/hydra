import { CheckCircleFillIcon, CheckIcon } from "@primer/octicons-react";
import { useTranslation } from "react-i18next";
import type { CatalogueLibraryState } from "./catalogue-library-state";
import "./catalogue-library-badge.scss";

export function CatalogueLibraryBadge({
  state,
}: Readonly<{ state: CatalogueLibraryState | undefined }>) {
  const { t } = useTranslation("catalogue");
  if (!state) return null;

  return (
    <span
      className={`catalogue-library-badge catalogue-library-badge--${state}`}
    >
      {state === "installed" ? (
        <CheckCircleFillIcon size={12} />
      ) : (
        <CheckIcon size={12} />
      )}
      {t(
        state === "installed"
          ? "library_state_installed"
          : "library_state_owned"
      )}
    </span>
  );
}
