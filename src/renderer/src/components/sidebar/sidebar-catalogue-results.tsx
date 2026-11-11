import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { SearchIcon } from "@primer/octicons-react";
import type { LibraryGame } from "@types";
import { getGameCatalogueIdentity } from "@shared";
import { setFilters } from "@renderer/features";
import { buildGameDetailsPath } from "@renderer/helpers";
import { useAppDispatch } from "@renderer/hooks";
import { useSearchSuggestions } from "@renderer/hooks/use-search-suggestions";
import SteamLogo from "@renderer/assets/steam-logo.svg?react";

const MIN_QUERY_LENGTH = 2;
const SHOWN_RESULTS = 5;
// Some suggestions are already in the library and get dropped.
const FETCHED_RESULTS = 10;

interface SidebarCatalogueResultsProps {
  query: string;
  library: LibraryGame[];
}

/** Catalogue games matching the sidebar search that aren't in the library. */
export function SidebarCatalogueResults({
  query,
  library,
}: Readonly<SidebarCatalogueResultsProps>) {
  const { t } = useTranslation("sidebar");
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const trimmedQuery = query.trim();
  const enabled = trimmedQuery.length >= MIN_QUERY_LENGTH;

  const { suggestions, isLoading } = useSearchSuggestions(
    trimmedQuery,
    false,
    enabled,
    "steam",
    FETCHED_RESULTS
  );

  const libraryKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const game of library) {
      keys.add(`${game.shop}:${game.objectId}`);
      const identity = getGameCatalogueIdentity(game);
      keys.add(`${identity.shop}:${identity.objectId}`);
    }
    return keys;
  }, [library]);

  const results = useMemo(
    () =>
      suggestions
        .filter((game) => !libraryKeys.has(`${game.shop}:${game.objectId}`))
        .slice(0, SHOWN_RESULTS),
    [suggestions, libraryKeys]
  );

  const [failedIcons, setFailedIcons] = useState<Set<string>>(new Set());

  if (!enabled) return null;

  const openCatalogue = () => {
    dispatch(setFilters({ title: trimmedQuery.slice(0, 255) }));
    if (!location.pathname.startsWith("/catalogue")) navigate("/catalogue");
  };

  return (
    <div className="sidebar__catalogue-results">
      <p className="sidebar__catalogue-heading">{t("from_the_catalogue")}</p>

      {isLoading && results.length === 0 && (
        <p className="sidebar__catalogue-status">{t("searching_catalogue")}</p>
      )}

      {!isLoading && results.length === 0 && (
        <p className="sidebar__catalogue-status">{t("no_catalogue_results")}</p>
      )}

      <ul className="sidebar__catalogue-list">
        {results.map((game) => {
          const key = `${game.shop}:${game.objectId}`;
          const showIcon = game.iconUrl && !failedIcons.has(key);

          return (
            <li key={key} className="sidebar__menu-item">
              <button
                type="button"
                className="sidebar__menu-item-button"
                onClick={() => navigate(buildGameDetailsPath(game))}
              >
                <span className="sidebar__game-icon-container">
                  {showIcon ? (
                    <img
                      className="sidebar__game-icon"
                      src={game.iconUrl!}
                      alt=""
                      loading="lazy"
                      onError={() =>
                        setFailedIcons((current) => new Set(current).add(key))
                      }
                    />
                  ) : (
                    <SteamLogo className="sidebar__game-icon" />
                  )}
                </span>
                <span className="sidebar__menu-item-button-label">
                  {game.title}
                </span>
              </button>
            </li>
          );
        })}

        <li className="sidebar__menu-item">
          <button
            type="button"
            className="sidebar__menu-item-button sidebar__catalogue-all"
            onClick={openCatalogue}
          >
            <SearchIcon size={16} />
            <span className="sidebar__menu-item-button-label">
              {t("see_all_in_catalogue")}
            </span>
          </button>
        </li>
      </ul>
    </div>
  );
}
