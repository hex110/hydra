import { useContext } from "react";
import { useTranslation } from "react-i18next";

import { Link } from "@renderer/components/link/link";
import { gameDetailsContext } from "@renderer/context";
import { buildGameModsPath } from "@renderer/helpers";
import { useGameMods } from "@renderer/hooks";

import { SidebarSection } from "@renderer/components/sidebar-section/sidebar-section";

/** A summary of the game's mods; the list itself lives on the Mods page. */
export function ModsSection() {
  const { t } = useTranslation("mods");
  const { game, shop, objectId, gameTitle } = useContext(gameDetailsContext);
  const hasExecutable = Boolean(game?.executablePath);
  const { gameMods: mods, error } = useGameMods(
    shop,
    objectId,
    hasExecutable && Boolean(objectId)
  );

  if (!hasExecutable || !objectId) return null;

  const installed = mods?.mods ?? [];
  const enabled = installed.filter((mod) => mod.enabled).length;
  const updates = installed.filter((mod) => mod.update).length;

  return (
    <SidebarSection variant="flat" title={t("section_title")}>
      <div className="mods-section">
        <p className="mods-section__summary">
          {error && !mods
            ? t("load_failed")
            : !mods
              ? t("loading")
              : installed.length === 0
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
