import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, TextField } from "@renderer/components";
import { gameDetailsContext } from "@renderer/context";
import { useAppSelector, useToast } from "@renderer/hooks";
import type { FloppySearchResult, LibraryGame } from "@types";

interface Match {
  mediaId: string | null;
  title: string | null;
  unlinked: boolean;
}

/** Which Floppy entry this game is tracked as, with a way to fix it. */
export function FloppyMatchSection({ game }: Readonly<{ game: LibraryGame }>) {
  const { t } = useTranslation("game_details");
  const { updateGame } = useContext(gameDetailsContext);
  const { showErrorToast } = useToast();
  const enabled = useAppSelector(
    (state) => state.userPreferences.value?.floppyEnabled
  );

  const [match, setMatch] = useState<Match | null>(null);
  const [query, setQuery] = useState(game.title);
  const [results, setResults] = useState<FloppySearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    window.electron
      .getGameFloppyMatch(game.shop, game.objectId)
      .then(setMatch)
      .catch(() => setMatch(null));
  }, [game.shop, game.objectId]);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  if (!enabled) return null;

  const search = async () => {
    setBusy(true);
    try {
      setResults(await window.electron.searchFloppyGames(query));
    } catch {
      showErrorToast(t("floppy_match_search_failed"));
    } finally {
      setBusy(false);
    }
  };

  const choose = async (mediaId: string | null) => {
    setBusy(true);
    try {
      await window.electron.setGameFloppyMatch(
        game.shop,
        game.objectId,
        mediaId
      );
      setResults(null);
      refresh();
      await updateGame();
    } catch {
      showErrorToast(t("floppy_match_failed"));
    } finally {
      setBusy(false);
    }
  };

  let current = t("floppy_match_none");
  if (match?.unlinked) current = t("floppy_match_unlinked");
  else if (match?.mediaId) current = match.title ?? `IGDB ${match.mediaId}`;

  return (
    <div className="game-options-modal__details-field">
      <h3>{t("floppy_match_title")}</h3>
      <p className="game-options-modal__optiscaler-hint">
        {t("floppy_match_current", { match: current })}
      </p>

      <TextField
        label={t("floppy_match_search")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        rightContent={
          <Button type="button" disabled={busy || !query} onClick={search}>
            {t("floppy_match_search_button")}
          </Button>
        }
      />

      {results && (
        <ul className="game-options-modal__floppy-results">
          {results.length === 0 && <li>{t("floppy_match_no_results")}</li>}
          {results.map((result) => (
            <li key={result.media_id}>
              <span>
                {result.title}
                {result.year ? ` (${result.year})` : ""}
                {result.platforms?.length
                  ? ` · ${result.platforms.slice(0, 3).join(", ")}`
                  : ""}
              </span>
              <Button
                type="button"
                theme="outline"
                disabled={busy}
                onClick={() => choose(String(result.media_id))}
              >
                {t("floppy_match_use")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {match?.mediaId && (
        <Button
          type="button"
          theme="outline"
          disabled={busy}
          onClick={() => choose(null)}
        >
          {t("floppy_match_unlink")}
        </Button>
      )}
    </div>
  );
}
