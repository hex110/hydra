import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import {
  ChevronDownIcon,
  FileDirectoryFillIcon,
  FileDirectoryIcon,
  HeartFillIcon,
  HeartIcon,
  LockIcon,
  PlusIcon,
  ChecklistIcon,
  FilterIcon,
  StarFillIcon,
  StarIcon,
} from "@primer/octicons-react";
import { useTranslation } from "react-i18next";
import type { GameCollection } from "@types";
import { useCloseOnLibraryScroll } from "./use-close-on-library-scroll";
import {
  LIBRARY_DROPDOWN_CHEVRON_SIZE,
  LIBRARY_DROPDOWN_COLLISION_PADDING,
  LIBRARY_DROPDOWN_SIDE_OFFSET,
} from "./library-dropdown";
import "./collections-filter.scss";

interface CollectionsFilterProps {
  collections: GameCollection[];
  selectedCollectionId: string | null;
  favoritesCollectionId: string;
  hiddenCollectionId: string;
  wishlistCollectionId: string;
  onSelect: (collectionId: string | null) => void;
  onCreate: () => void;
  onManageGames: (collection: GameCollection) => void;
  onCollectionContextMenu: (
    event: React.MouseEvent<HTMLElement>,
    collection: GameCollection
  ) => void;
}

type SpecialCollection = "favorites" | "hidden" | "wishlist" | null;

const getCollectionIcon = (
  special: SpecialCollection,
  collection: GameCollection,
  isActive: boolean
) => {
  if (special === "favorites") return isActive ? HeartFillIcon : HeartIcon;
  if (special === "wishlist") return isActive ? StarFillIcon : StarIcon;
  if (special === "hidden") return LockIcon;
  if (collection.savedFilter) return FilterIcon;
  return isActive ? FileDirectoryFillIcon : FileDirectoryIcon;
};

export function CollectionsFilter({
  collections,
  selectedCollectionId,
  favoritesCollectionId,
  hiddenCollectionId,
  wishlistCollectionId,
  onSelect,
  onCreate,
  onManageGames,
  onCollectionContextMenu,
}: Readonly<CollectionsFilterProps>) {
  const { t } = useTranslation(["library", "sidebar"]);

  const [open, setOpen] = useCloseOnLibraryScroll();

  const selectedCollection = collections.find(
    (collection) => collection.id === selectedCollectionId
  );

  const getSpecial = (id: string): SpecialCollection => {
    if (id === favoritesCollectionId) return "favorites";
    if (id === hiddenCollectionId) return "hidden";
    if (id === wishlistCollectionId) return "wishlist";
    return null;
  };

  const TriggerIcon = selectedCollection
    ? getCollectionIcon(
        getSpecial(selectedCollection.id),
        selectedCollection,
        true
      )
    : FileDirectoryIcon;

  return (
    <DropdownMenuPrimitive.Root
      modal={false}
      open={open}
      onOpenChange={setOpen}
    >
      <DropdownMenuPrimitive.Trigger asChild>
        <button
          type="button"
          className="collections-filter__trigger"
          aria-label={t("collections")}
        >
          <TriggerIcon size={16} />
          <span className="collections-filter__trigger-label">
            {selectedCollection ? selectedCollection.name : t("collections")}
          </span>
          <ChevronDownIcon
            size={LIBRARY_DROPDOWN_CHEVRON_SIZE}
            className="collections-filter__chevron"
          />
        </button>
      </DropdownMenuPrimitive.Trigger>

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="start"
          sideOffset={LIBRARY_DROPDOWN_SIDE_OFFSET}
          collisionPadding={LIBRARY_DROPDOWN_COLLISION_PADDING}
          className="collections-filter__content"
          onInteractOutside={(event) => {
            const target = event.detail.originalEvent
              .target as HTMLElement | null;
            if (target?.closest(".context-menu, [data-hydra-dialog]")) {
              event.preventDefault();
            }
          }}
        >
          <div className="collections-filter__list">
            {collections.map((collection) => {
              const special = getSpecial(collection.id);
              const isActive = collection.id === selectedCollectionId;

              const CollectionIcon = getCollectionIcon(
                special,
                collection,
                isActive
              );

              return (
                <DropdownMenuPrimitive.Item
                  key={collection.id}
                  className={`collections-filter__item${isActive ? " collections-filter__item--active" : ""}`}
                  onSelect={() => onSelect(isActive ? null : collection.id)}
                  onContextMenu={
                    special
                      ? undefined
                      : (event) => onCollectionContextMenu(event, collection)
                  }
                  title={collection.savedFilter ? t("saved_filter") : undefined}
                >
                  <CollectionIcon size={16} />
                  <span className="collections-filter__item-label">
                    {collection.name}
                  </span>
                  <span className="collections-filter__item-count">
                    {collection.gamesCount}
                  </span>
                </DropdownMenuPrimitive.Item>
              );
            })}
          </div>

          <DropdownMenuPrimitive.Separator className="collections-filter__separator" />

          {selectedCollection &&
            !getSpecial(selectedCollection.id) &&
            !selectedCollection.savedFilter && (
              <DropdownMenuPrimitive.Item
                className="collections-filter__item"
                onSelect={() => onManageGames(selectedCollection)}
              >
                <ChecklistIcon size={16} />
                <span className="collections-filter__item-label">
                  {t("manage_collection_games")}
                </span>
              </DropdownMenuPrimitive.Item>
            )}

          <DropdownMenuPrimitive.Item
            className="collections-filter__item"
            onSelect={(event) => {
              event.preventDefault();
              onCreate();
            }}
          >
            <PlusIcon size={16} />
            <span className="collections-filter__item-label">
              {t("create_collection", { ns: "sidebar" })}
            </span>
          </DropdownMenuPrimitive.Item>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
