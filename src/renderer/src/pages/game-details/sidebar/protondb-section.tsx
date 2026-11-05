import cn from "classnames";
import { StarIcon } from "@primer/octicons-react";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import { useTranslation } from "react-i18next";
import type { ProtonDBData } from "@types";
import ProtonDBLogo from "@renderer/assets/protondb-logo.svg?url";
import SteamDeckLogo from "@renderer/assets/steam-deck-logo.svg?url";
import {
  SidebarRow,
  SidebarRows,
  SidebarSection,
} from "@renderer/components/sidebar-section/sidebar-section";
import "./sidebar.scss";

const protonTierTranslation: Record<string, string> = {
  borked: "protondb_tier_borked",
  bronze: "protondb_tier_bronze",
  silver: "protondb_tier_silver",
  gold: "protondb_tier_gold",
  platinum: "protondb_tier_platinum",
};

const deckCompatibilityTranslation: Record<string, string> = {
  verified: "deck_verified",
  playable: "deck_playable",
  unsupported: "deck_unsupported",
  unknown: "deck_unknown",
};

export interface ProtonDBSectionProps {
  protonDBData: ProtonDBData | null;
  isLoading: boolean;
  objectId: string;
}

export function ProtonDBSection({
  protonDBData,
  isLoading,
  objectId,
}: ProtonDBSectionProps) {
  const { t } = useTranslation(["game_details", "catalogue"]);

  const tier = protonDBData?.tier?.toLowerCase().trim() ?? null;
  const tierKey = tier ? protonTierTranslation[tier] : null;
  const isKnownTier = Boolean(tierKey);
  const tierLabel = tierKey ? t(tierKey) : "-";

  const scoreLabel =
    typeof protonDBData?.score === "number"
      ? `${Math.round(protonDBData.score * 100)}%`
      : "-";

  const deckKey = protonDBData?.deckCompatibility
    ? deckCompatibilityTranslation[protonDBData.deckCompatibility]
    : null;

  if (!protonDBData && !isLoading) return null;

  return (
    <SkeletonTheme baseColor="#1c1c1c" highlightColor="#444">
      <SidebarSection
        variant="flat"
        title={t("catalogue:protondb")}
        subtitle={t("view_on_protondb")}
        subtitleHref={`https://www.protondb.com/app/${objectId}`}
      >
        {protonDBData ? (
          <SidebarRows>
            <SidebarRow
              label={t("protondb_tier")}
              icon={
                <img
                  src={ProtonDBLogo}
                  alt=""
                  className="protondb__icon"
                  aria-hidden="true"
                />
              }
            >
              <span
                className={cn(
                  "protondb__tier-badge",
                  isKnownTier && `protondb__tier-badge--${tier}`
                )}
              >
                {tierLabel}
              </span>
            </SidebarRow>

            <SidebarRow
              label={t("deck_compatibility")}
              icon={
                <img
                  src={SteamDeckLogo}
                  alt=""
                  className="protondb__icon"
                  aria-hidden="true"
                />
              }
            >
              <span className="protondb__value">
                {deckKey ? t(deckKey) : t("deck_unknown")}
              </span>
            </SidebarRow>

            <SidebarRow
              label={t("protondb_score")}
              icon={<StarIcon size={14} aria-hidden="true" />}
            >
              {scoreLabel}
            </SidebarRow>
          </SidebarRows>
        ) : (
          <SidebarRows>
            {Array.from({ length: 3 }).map((_, index) => (
              <SidebarRow
                key={index}
                label={<Skeleton className="protondb__title-skeleton" />}
              >
                <Skeleton className="protondb__value-skeleton" />
              </SidebarRow>
            ))}
          </SidebarRows>
        )}
      </SidebarSection>
    </SkeletonTheme>
  );
}
