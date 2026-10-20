import { CheckCircleFillIcon, CheckCircleIcon } from "@primer/octicons-react";
import { useTranslation } from "react-i18next";
import "./installed-filter.scss";

interface InstalledFilterProps {
  showInstalledOnly: boolean;
  onShowInstalledOnlyChange: (showInstalledOnly: boolean) => void;
}

export function InstalledFilter({
  showInstalledOnly,
  onShowInstalledOnlyChange,
}: Readonly<InstalledFilterProps>) {
  const { t } = useTranslation("library");

  return (
    <button
      type="button"
      className={`library-installed-filter__button${showInstalledOnly ? " library-installed-filter__button--active" : ""}`}
      onClick={() => onShowInstalledOnlyChange(!showInstalledOnly)}
      aria-pressed={showInstalledOnly}
      title={t("show_installed_only")}
    >
      {showInstalledOnly ? (
        <CheckCircleFillIcon size={16} />
      ) : (
        <CheckCircleIcon size={16} />
      )}
      <span>{t("installed_filter")}</span>
    </button>
  );
}
