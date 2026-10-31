import { CheckCircleFillIcon, CheckIcon } from "@primer/octicons-react";
import { useTranslation } from "react-i18next";
import type { CatalogueLibraryState } from "@renderer/pages/catalogue/catalogue-library-state";
import "./game-library-badge.scss";

/** Whether a store game is in your library: the same badge on every page. */
export function GameLibraryBadge({
  state,
  overlay = false,
}: Readonly<{
  state: CatalogueLibraryState | undefined;
  /** Over a cover's top-left corner, in a positioned parent. */
  overlay?: boolean;
}>) {
  const { t } = useTranslation("catalogue");
  if (!state) return null;

  return (
    <span
      className={`game-library-badge game-library-badge--${state}${
        overlay ? " game-library-badge--overlay" : ""
      }`}
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
