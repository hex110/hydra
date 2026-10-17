import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SearchIcon } from "@primer/octicons-react";
import cn from "classnames";

import { TextField } from "@renderer/components";
import { logger } from "@renderer/logger";
import type { ScannedFolderMatch, ScannedGameChoice } from "@types";

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_LIMIT = 8;
const MIN_QUERY_LENGTH = 2;

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; results: ScannedGameChoice[] }
  | { status: "failed" };

export interface ScanGamePickerProps {
  match: ScannedFolderMatch;
  pickedObjectId: string | undefined;
  onPick: (match: ScannedFolderMatch, objectId: string) => void;
}

/**
 * The games a scanned executable could belong to, plus a catalogue search for
 * when the right one is not among them.
 */
export function ScanGamePicker({
  match,
  pickedObjectId,
  onPick,
}: Readonly<ScanGamePickerProps>) {
  const { t } = useTranslation("header");

  const [isSearching, setIsSearching] = useState(match.choices.length === 0);
  const [query, setQuery] = useState(match.searchQuery ?? "");
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  // A search result that was picked stays visible when the query changes.
  const [pickedResult, setPickedResult] = useState<ScannedGameChoice | null>(
    null
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (!isSearching || trimmed.length < MIN_QUERY_LENGTH) {
      setSearch({ status: "idle" });
      return;
    }

    let isStale = false;
    setSearch({ status: "loading" });

    const timeout = setTimeout(async () => {
      try {
        const response = await window.electron.hydraApi.get<
          (ScannedGameChoice & { shop: string })[]
        >("/catalogue/search/suggestions", {
          params: { query: trimmed, limit: SEARCH_LIMIT, shop: "steam" },
          needsAuth: false,
        });

        if (isStale) return;
        setSearch({
          status: "done",
          results: response
            .filter((item) => item.shop === "steam")
            .map(({ objectId, title, iconUrl }) => ({
              objectId,
              title,
              iconUrl: iconUrl ?? null,
            })),
        });
      } catch (error) {
        if (isStale) return;
        logger.error(
          "Failed to search the catalogue for a scanned game",
          error
        );
        setSearch({ status: "failed" });
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      isStale = true;
      clearTimeout(timeout);
    };
  }, [isSearching, query]);

  const shownChoices =
    pickedResult &&
    !match.choices.some((choice) => choice.objectId === pickedResult.objectId)
      ? [...match.choices, pickedResult]
      : match.choices;
  const shownIds = new Set(shownChoices.map((choice) => choice.objectId));
  const searchResults =
    search.status === "done"
      ? search.results.filter((choice) => !shownIds.has(choice.objectId))
      : [];

  const renderChoice = (choice: ScannedGameChoice, fromSearch = false) => (
    <button
      key={choice.objectId}
      type="button"
      className={cn("scan-games-modal__choice", {
        "scan-games-modal__choice--active": pickedObjectId === choice.objectId,
      })}
      onClick={() => {
        if (fromSearch) setPickedResult(choice);
        onPick(match, choice.objectId);
      }}
    >
      {choice.iconUrl && (
        <img
          src={choice.iconUrl}
          alt=""
          className="scan-games-modal__choice-icon"
        />
      )}
      <span>{choice.title}</span>
    </button>
  );

  return (
    <li className="scan-games-modal__ambiguous-item">
      <span className="scan-games-modal__game-path">
        {match.folderPath ?? match.executablePath}
      </span>

      {(shownChoices.length > 0 || !isSearching) && (
        <div className="scan-games-modal__ambiguous-choices">
          {shownChoices.map((choice) => renderChoice(choice))}
          {!isSearching && (
            <button
              type="button"
              className="scan-games-modal__choice scan-games-modal__choice--search"
              onClick={() => setIsSearching(true)}
            >
              <SearchIcon size={12} />
              <span>{t("scan_games_not_listed")}</span>
            </button>
          )}
        </div>
      )}

      {isSearching && (
        <div className="scan-games-modal__search">
          <TextField
            theme="dark"
            value={query}
            placeholder={t("scan_games_search_placeholder")}
            onChange={(event) => setQuery(event.target.value)}
          />

          {search.status === "loading" && (
            <p className="scan-games-modal__search-status">
              {t("scan_games_searching")}
            </p>
          )}
          {search.status === "failed" && (
            <p className="scan-games-modal__search-status">
              {t("scan_games_search_failed")}
            </p>
          )}
          {search.status === "done" && searchResults.length === 0 && (
            <p className="scan-games-modal__search-status">
              {t("scan_games_search_no_results")}
            </p>
          )}
          {searchResults.length > 0 && (
            <div className="scan-games-modal__ambiguous-choices">
              {searchResults.map((choice) => renderChoice(choice, true))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
