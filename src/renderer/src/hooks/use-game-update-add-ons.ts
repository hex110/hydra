import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { logger } from "@renderer/logger";
import type { GameShop, GameUpdateAddOns } from "@types";

/**
 * What an in-place update will take out of the game and put back after
 * (mods, OptiScaler, ReShade, the widescreen patch), as sentences to show
 * before it starts. Empty when there is nothing.
 */
export function useGameUpdateAddOns(
  shop: GameShop | null | undefined,
  objectId: string | null | undefined
) {
  const { t, i18n } = useTranslation("downloads");
  const [addOns, setAddOns] = useState<GameUpdateAddOns | null>(null);

  useEffect(() => {
    setAddOns(null);
    if (!shop || !objectId) return;
    let cancelled = false;
    window.electron
      .getGameUpdateAddOns(shop, objectId)
      .then((result) => {
        if (!cancelled) setAddOns(result);
      })
      .catch((error) => logger.error("Failed to read update add-ons", error));
    return () => {
      cancelled = true;
    };
  }, [shop, objectId]);

  if (!addOns) return { short: null, sentences: [] as string[] };

  const items = [
    ...(addOns.mods > 0
      ? [t("update_add_ons_mods", { count: addOns.mods })]
      : []),
    ...addOns.tools.map((tool) =>
      t(`update_add_ons_tool_${tool.replaceAll("-", "_")}`)
    ),
  ];
  if (items.length === 0) return { short: null, sentences: [] as string[] };

  const list = new Intl.ListFormat(i18n.language || "en", {
    type: "conjunction",
  }).format(items);
  const sentences = [t("update_add_ons", { items: list })];
  if (addOns.tools.includes("widescreen-patch"))
    sentences.push(t("update_add_ons_widescreen"));

  return { short: t("update_add_ons_short", { items: list }), sentences };
}
