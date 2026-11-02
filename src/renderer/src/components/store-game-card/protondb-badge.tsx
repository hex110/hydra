import { useTranslation } from "react-i18next";
import cn from "classnames";
import ProtonDBLogo from "@renderer/assets/protondb-logo.svg?url";

const PROTONDB_TIERS = ["borked", "bronze", "silver", "gold", "platinum"];

/** The ProtonDB tier a search result carries, if it has a known one. */
export const getProtonDbBadge = (game: {
  tier?: string | null;
  bestReportedTier?: string | null;
  protondbSupportBadge?: string | null;
  protondbSupportBadges?: string[];
}) => {
  const raw =
    game.tier ??
    game.bestReportedTier ??
    game.protondbSupportBadge ??
    game.protondbSupportBadges?.[0] ??
    null;
  const badge = raw?.toLowerCase().trim() ?? null;
  return badge && PROTONDB_TIERS.includes(badge) ? badge : null;
};

export function ProtonDBBadge({ badge }: Readonly<{ badge: string }>) {
  const { t } = useTranslation("game_details");

  const label = t(`protondb_tier_${badge}`, {
    defaultValue: t("protondb_tier_unknown"),
  });

  return (
    <span
      className={cn(
        "store-game-cover__protondb",
        `store-game-cover__protondb--${badge}`
      )}
      title={t("protondb_badge_title", { tier: label })}
    >
      <img
        src={ProtonDBLogo}
        alt=""
        aria-hidden="true"
        width={12}
        height={12}
        loading="lazy"
      />
      {label}
    </span>
  );
}
