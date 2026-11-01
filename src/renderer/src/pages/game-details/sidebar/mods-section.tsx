import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Link } from "@renderer/components/link/link";
import { gameDetailsContext } from "@renderer/context";
import { buildGameModsPath } from "@renderer/helpers";
import { logger } from "@renderer/logger";
import type { GameMods } from "@types";

import { SidebarSection } from "../sidebar-section/sidebar-section";

/** A summary of the game's mods; the list itself lives on the Mods page. */
export function ModsSection() {
  const { t } = useTranslation("mods");
  const { game, shop, objectId, gameTitle } = useContext(gameDetailsContext);
  const [mods, setMods] = useState<GameMods | null>(null);

  const hasExecutable = Boolean(game?.executablePath);

  useEffect(() => {
    if (!hasExecutable || !objectId) return;
    window.electron
      .getGameMods(shop, objectId)
      .then(setMods)
      .catch((error) => logger.error("Failed to load mods", error));
  }, [hasExecutable, shop, objectId]);

  if (!hasExecutable || !objectId) return null;

  const installed = mods?.mods ?? [];
  const enabled = installed.filter((mod) => mod.enabled).length;
  const updates = installed.filter((mod) => mod.update).length;

  return (
    <SidebarSection title={t("section_title")}>
      <div className="mods-section">
        <p className="mods-section__summary">
          {installed.length === 0
            ? t("section_empty")
            : t("section_summary", { count: installed.length, enabled })}
          {updates > 0 && ` ${t("section_updates", { count: updates })}`}
        </p>
        <Link
          to={buildGameModsPath({ shop, objectId, title: gameTitle })}
          className="mods-section__link"
        >
          {installed.length === 0 ? t("section_browse") : t("section_manage")}
        </Link>
      </div>
    </SidebarSection>
  );
}
