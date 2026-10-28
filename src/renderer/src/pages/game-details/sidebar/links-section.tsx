import { useTranslation } from "react-i18next";
import { LinkExternalIcon } from "@primer/octicons-react";
import { Link } from "@renderer/components/link/link";
import { SidebarSection } from "../sidebar-section/sidebar-section";
import "./links-section.scss";

export interface LinksSectionProps {
  title: string;
  steamAppId: string | null;
}

/** Other sites for the game; ProtonDB and HowLongToBeat link from their own sections. */
export const getGameLinks = (title: string, steamAppId: string | null) =>
  steamAppId
    ? [
        {
          key: "steam",
          url: `https://store.steampowered.com/app/${steamAppId}`,
        },
        { key: "steamdb", url: `https://steamdb.info/app/${steamAppId}/` },
        {
          key: "pcgamingwiki",
          url: `https://www.pcgamingwiki.com/api/appid.php?appid=${steamAppId}`,
        },
      ]
    : [
        {
          key: "pcgamingwiki",
          url: `https://www.pcgamingwiki.com/w/index.php?search=${encodeURIComponent(title)}`,
        },
      ];

export function LinksSection({
  title,
  steamAppId,
}: Readonly<LinksSectionProps>) {
  const { t } = useTranslation("game_details");

  return (
    <SidebarSection title={t("links")}>
      <ul className="links-section">
        {getGameLinks(title, steamAppId).map((link) => (
          <li key={link.key}>
            <Link to={link.url} className="links-section__link">
              {t(`open_on_${link.key}`)}
              <LinkExternalIcon size={12} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </SidebarSection>
  );
}
