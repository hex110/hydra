import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FileDirectoryIcon,
  HeartIcon,
  ListUnorderedIcon,
  StarIcon,
  TrashIcon,
  XIcon,
} from "@primer/octicons-react";
import { applyLibraryGroupAction, PLAY_STATUSES } from "@shared";
import type { GameCollection, LibraryGame, PlayStatus } from "@types";
import { ConfirmationModal, DropdownMenu } from "@renderer/components";
import {
  useDownload,
  useGameCollections,
  useLibrary,
  useToast,
} from "@renderer/hooks";
import { getGameCollectionIds } from "@renderer/helpers";
import { logger } from "@renderer/logger";
import "./library-selection-bar.scss";

type SelectedGame = LibraryGame & {
  members?: LibraryGame[];
  downloadGame?: LibraryGame;
};

interface LibrarySelectionBarProps {
  games: SelectedGame[];
  collections: GameCollection[];
  onClear: () => void;
}

const membersOf = (game: SelectedGame) =>
  game.members?.length ? game.members : [game];

/** Actions for every selected card at once (Ctrl/Shift-click to select). */
export function LibrarySelectionBar({
  games,
  collections,
  onClear,
}: Readonly<LibrarySelectionBarProps>) {
  const { t } = useTranslation("library");
  const { updateLibrary } = useLibrary();
  const { assignGameToCollection } = useGameCollections();
  const { removeGameFromLibrary, removeGameInstaller } = useDownload();
  const { showSuccessToast, showErrorToast } = useToast();
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<"remove" | "uninstall" | null>(null);

  const allMembers = games.flatMap(membersOf);
  const removableFiles = games
    .map((game) => game.downloadGame ?? game)
    .filter((game) => game.download?.downloadPath);

  const run = async (action: () => Promise<unknown>) => {
    if (pending) return;
    setPending(true);
    try {
      await action();
      showSuccessToast(t("bulk_action_done", { count: games.length }));
    } catch (error) {
      logger.error("Bulk library action failed", error);
      showErrorToast(t("bulk_action_failed"));
    } finally {
      setPending(false);
      await updateLibrary();
    }
  };

  const setPlayStatus = (playStatus: PlayStatus | null) =>
    run(() =>
      applyLibraryGroupAction(allMembers, (member) =>
        window.electron.setGamePlayStatus(
          member.shop,
          member.objectId,
          playStatus
        )
      )
    );

  const addToCollection = (collectionId: string) =>
    run(async () => {
      for (const game of games) {
        const current = getGameCollectionIds(game);
        if (current.includes(collectionId)) continue;
        await assignGameToCollection(game, [...current, collectionId]);
      }
    });

  const addToFavorites = () =>
    run(() =>
      applyLibraryGroupAction(
        allMembers.filter((member) => !member.favorite),
        (member) =>
          window.electron.addGameToFavorites(member.shop, member.objectId)
      )
    );

  const setWishlisted = (wishlisted: boolean) =>
    run(() =>
      applyLibraryGroupAction(allMembers, (member) =>
        window.electron.setGameWishlisted(
          member.shop,
          member.objectId,
          wishlisted
        )
      )
    );

  const removeFromLibrary = () =>
    run(async () => {
      for (const member of allMembers) {
        if (member.download?.status === "active") {
          await window.electron.cancelGameDownload(
            member.shop,
            member.objectId
          );
        }
        await removeGameFromLibrary(member.shop, member.objectId);
      }
      onClear();
    });

  const uninstall = () =>
    run(async () => {
      for (const game of removableFiles) {
        await removeGameInstaller(game.shop, game.objectId);
      }
    });

  const assignable = collections.filter(
    (collection) => !collection.savedFilter && !collection.id.startsWith("__")
  );

  return (
    <div className="library-selection-bar" role="toolbar">
      <span className="library-selection-bar__count">
        {t("selected_count", { count: games.length })}
      </span>

      <div className="library-selection-bar__actions">
        <DropdownMenu
          side="top"
          align="start"
          items={[
            ...PLAY_STATUSES.map((status) => ({
              label: t(`play_status_${status}`),
              onClick: () => void setPlayStatus(status),
            })),
            {
              label: t("play_status_clear"),
              onClick: () => void setPlayStatus(null),
            },
          ]}
        >
          <button
            type="button"
            className="library-selection-bar__button"
            disabled={pending}
          >
            <ListUnorderedIcon size={14} />
            {t("play_status")}
          </button>
        </DropdownMenu>

        {assignable.length > 0 && (
          <DropdownMenu
            side="top"
            align="start"
            items={assignable.map((collection) => ({
              label: collection.name,
              onClick: () => void addToCollection(collection.id),
            }))}
          >
            <button
              type="button"
              className="library-selection-bar__button"
              disabled={pending}
            >
              <FileDirectoryIcon size={14} />
              {t("add_to_collection")}
            </button>
          </DropdownMenu>
        )}

        <button
          type="button"
          className="library-selection-bar__button"
          onClick={() => void addToFavorites()}
          disabled={pending}
        >
          <HeartIcon size={14} />
          {t("add_to_favorites")}
        </button>

        <button
          type="button"
          className="library-selection-bar__button"
          onClick={() =>
            void setWishlisted(!allMembers.every((member) => member.wishlisted))
          }
          disabled={pending}
        >
          <StarIcon size={14} />
          {allMembers.every((member) => member.wishlisted)
            ? t("remove_from_wishlist_action")
            : t("add_to_wishlist")}
        </button>

        {removableFiles.length > 0 && (
          <button
            type="button"
            className="library-selection-bar__button library-selection-bar__button--danger"
            onClick={() => setConfirm("uninstall")}
            disabled={pending}
          >
            <TrashIcon size={14} />
            {t("bulk_remove_files", { count: removableFiles.length })}
          </button>
        )}

        <button
          type="button"
          className="library-selection-bar__button library-selection-bar__button--danger"
          onClick={() => setConfirm("remove")}
          disabled={pending}
        >
          <XIcon size={14} />
          {t("bulk_remove_from_library")}
        </button>
      </div>

      <button
        type="button"
        className="library-selection-bar__clear"
        onClick={onClear}
        title={t("clear_selection")}
        aria-label={t("clear_selection")}
      >
        <XIcon size={16} />
      </button>

      <ConfirmationModal
        visible={confirm !== null}
        title={t(
          confirm === "uninstall"
            ? "bulk_remove_files_title"
            : "bulk_remove_from_library_title",
          {
            count:
              confirm === "uninstall" ? removableFiles.length : games.length,
          }
        )}
        descriptionText={t(
          confirm === "uninstall"
            ? "bulk_remove_files_description"
            : "bulk_remove_from_library_description"
        )}
        confirmButtonLabel={t(
          confirm === "uninstall"
            ? "bulk_remove_files_confirm"
            : "bulk_remove_from_library"
        )}
        cancelButtonLabel={t("cancel")}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm;
          setConfirm(null);
          void (action === "uninstall" ? uninstall() : removeFromLibrary());
        }}
      />
    </div>
  );
}
