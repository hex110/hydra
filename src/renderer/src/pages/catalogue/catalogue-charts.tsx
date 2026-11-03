import { useTranslation } from "react-i18next";

/** Replaced by the charts table. */
export function CatalogueCharts() {
  const { t } = useTranslation("catalogue");

  return <p className="catalogue__search-error">{t("charts_coming_soon")}</p>;
}
