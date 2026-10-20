import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GameCollection, LibraryGamePresentation } from "@types";
import {
  applyLibraryGroupAction,
  getLibraryCollectionIds,
  getLibraryGroupCollectionAssignments,
  groupLibraryGames,
  removeDiacritics,
} from "@shared";
import { Button, CheckboxField, Modal, TextField } from "@renderer/components";
import { useGameCollections, useLibrary, useToast } from "@renderer/hooks";

interface ManageCollectionGamesModalProps {
  collection: GameCollection | null;
  onClose: () => void;
}

const groupKey = (game: LibraryGamePresentation) =>
  `${game.shop}:${game.objectId}`;

const isInCollection = (game: LibraryGamePresentation, collectionId: string) =>
  game.members.some((member) =>
    getLibraryCollectionIds(member).includes(collectionId)
  );

/** Tick the games that belong in a collection, then save them all at once. */
export function ManageCollectionGamesModal({
  collection,
  onClose,
}: Readonly<ManageCollectionGamesModalProps>) {
  const { t } = useTranslation("library");
  const { library, updateLibrary } = useLibrary();
  const { loadCollections } = useGameCollections();
  const { showSuccessToast, showErrorToast } = useToast();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const games = useMemo(
    () =>
      groupLibraryGames(library).sort((a, b) =>
        (a.title ?? "").localeCompare(b.title ?? "", undefined, {
          sensitivity: "base",
        })
      ),
    [library]
  );

  useEffect(() => {
    if (!collection) return;
    setQuery("");
    setSelected(
      new Set(
        games
          .filter((game) => isInCollection(game, collection.id))
          .map(groupKey)
      )
    );
    // Only reset when a collection is opened, not when the library refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection?.id]);

  const visibleGames = useMemo(() => {
    const normalized = removeDiacritics(query).toLowerCase().trim();
    if (!normalized) return games;
    return games.filter((game) =>
      removeDiacritics(game.title ?? "")
        .toLowerCase()
        .includes(normalized)
    );
  }, [games, query]);

  const changes = useMemo(() => {
    if (!collection) return [];
    return games.filter(
      (game) =>
        isInCollection(game, collection.id) !== selected.has(groupKey(game))
    );
  }, [collection, games, selected]);

  const toggle = (game: LibraryGamePresentation) => {
    setSelected((previous) => {
      const next = new Set(previous);
      const key = groupKey(game);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = async () => {
    if (!collection || changes.length === 0) return;
    setIsSaving(true);

    let failed = 0;
    for (const game of changes) {
      const previous = new Set(game.members.flatMap(getLibraryCollectionIds));
      if (selected.has(groupKey(game))) previous.add(collection.id);
      else previous.delete(collection.id);

      const assignments = getLibraryGroupCollectionAssignments(game.members, [
        ...previous,
      ]);

      try {
        await applyLibraryGroupAction(
          assignments.map(({ game: member }) => member),
          (member) =>
            window.electron.assignGameToCollection(
              member.shop,
              member.objectId,
              assignments.find(({ game: item }) => item === member)!
                .collectionIds
            )
        );
      } catch {
        failed++;
      }
    }

    await Promise.all([updateLibrary(), loadCollections()]);
    setIsSaving(false);

    if (failed > 0) {
      showErrorToast(t("manage_collection_games_failed", { count: failed }));
      return;
    }

    showSuccessToast(t("manage_collection_games_saved"));
    onClose();
  };

  return (
    <Modal
      visible={Boolean(collection)}
      title={t("manage_collection_games_title", {
        collectionName: collection?.name ?? "",
      })}
      description={t("manage_collection_games_description")}
      onClose={() => {
        if (!isSaving) onClose();
      }}
    >
      <div className="collection-context-menu__manage">
        <TextField
          placeholder={t("manage_collection_games_search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          theme="dark"
          disabled={isSaving}
        />

        <div className="collection-context-menu__manage-list">
          {visibleGames.map((game) => (
            <CheckboxField
              key={groupKey(game)}
              label={game.title}
              checked={selected.has(groupKey(game))}
              disabled={isSaving}
              onChange={() => toggle(game)}
            />
          ))}
          {visibleGames.length === 0 && (
            <p className="collection-context-menu__manage-empty">
              {t("no_results")}
            </p>
          )}
        </div>

        <div className="collection-context-menu__modal-actions">
          <span className="collection-context-menu__manage-count">
            {t("manage_collection_games_count", { count: selected.size })}
          </span>
          <Button
            type="button"
            theme="outline"
            onClick={onClose}
            disabled={isSaving}
          >
            {t("cancel", { ns: "sidebar" })}
          </Button>
          <Button
            type="button"
            theme="primary"
            onClick={() => void save()}
            disabled={isSaving || changes.length === 0}
          >
            {isSaving
              ? t("manage_collection_games_saving")
              : t("manage_collection_games_save", { count: changes.length })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
