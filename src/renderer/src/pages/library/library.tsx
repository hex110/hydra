import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useLibrary,
  useLibraryView,
  useAppDispatch,
  useAppSelector,
  useGameCollections,
  useUserDetails,
} from "@renderer/hooks";
import { selectIsLibraryLoading, setHeaderTitle } from "@renderer/features";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  GraphIcon,
  HeartIcon,
  SidebarExpandIcon,
  StarIcon,
  TelescopeIcon,
  FileDirectoryIcon,
  SearchIcon,
  SyncIcon,
} from "@primer/octicons-react";
import { useTranslation } from "react-i18next";
import { groupLibraryGames, removeDiacritics } from "@shared";
import type { GameCollection, LibraryGame, SavedLibraryFilter } from "@types";
import { CreateCollectionModal, GameContextMenu } from "@renderer/components";
import { useCollectionContextMenu } from "@renderer/context";
import {
  buildGameDetailsPath,
  getGameCollectionIds,
  isGameInstalled,
  isGameReadyToPlay,
  sortLibraryGames,
} from "@renderer/helpers";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LibraryGameCard } from "./library-game-card";
import { LibraryGameCardLarge } from "./library-game-card-large";
import { ViewOptions } from "./view-options";
import { FilterOptions, SORT_OPTIONS, SortOption } from "./filter-options";
import { GroupBySelect } from "./group-by-select";
import { CategoryFilter } from "./category-filter";
import { InstalledFilter } from "./installed-filter";
import { PlatformFilter } from "./platform-filter";
import { LibraryFiltersMenu } from "./library-filters-menu";
import { CollectionsFilter } from "./collections-filter";
import { LibraryGamesSkeleton } from "./library-games-skeleton";
import { LibrarySelectionBar } from "./library-selection-bar";
import { LibraryDetailsPane } from "./library-details-pane";
import { LibraryStatsModal } from "./library-stats-modal";
import { getLibraryFilterOptions } from "./library-category";
import {
  getAvailableLibraryTabs,
  getLibraryGenres,
  parseStoredLibraryFilters,
  type LibraryTab,
} from "./library-filters";
import {
  applyLibraryView,
  tabShowsPlatforms,
  type LibraryView,
} from "./library-view";
import {
  getLibraryColumns,
  isLargeCardStep,
  LIBRARY_CARD_SIZE_STORAGE_KEY,
  readStoredCardSize,
} from "./library-card-size";
import {
  groupLibrary,
  LIBRARY_COLLAPSED_GROUPS_STORAGE_KEY,
  LIBRARY_GROUP_BY_OPTIONS,
  LIBRARY_GROUP_BY_STORAGE_KEY,
  type LibraryGroupBy,
} from "./library-grouping";
import {
  EMPTY_SELECTION,
  pruneSelection,
  selectOnly,
  selectRange,
  toggleSelection,
  type LibrarySelection,
} from "./library-selection";
import {
  findTypeAheadMatch,
  moveFocus,
  type LibraryArrowKey,
} from "./library-keyboard";
import {
  ClassicsOnboardingModal,
  hasDismissedClassicsOnboarding,
} from "@renderer/components/classics-onboarding-modal/classics-onboarding-modal";
import "./library.scss";

const FAVORITES_COLLECTION_ID = "__favorites__";
const HIDDEN_COLLECTION_ID = "__hidden__";
const WISHLIST_COLLECTION_ID = "__wishlist__";
const EMPTY_HIDDEN_GAMES: LibraryGame[] = [];
const GAP = 16;
const LARGE_CARD_ESTIMATED_HEIGHT = 300;
const GROUP_HEADER_HEIGHT = 44;
const FALLBACK_ITEM_WIDTH = 150;
const DETAILS_PANE_STORAGE_KEY = "library-details-pane";
const TYPE_AHEAD_RESET_MS = 700;
const ARROW_KEYS = new Set<string>([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

type LibraryRow =
  | {
      kind: "header";
      id: string;
      label: string;
      count: number;
      collapsed: boolean;
    }
  | { kind: "games"; id: string; games: LibraryGame[] };

const gameKey = (game: { shop: string; objectId: string }) =>
  `${game.shop}:${game.objectId}`;

const readStorage = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered; the setting still applies for now.
  }
};

const readStoredGroupBy = (): LibraryGroupBy => {
  const stored = readStorage(LIBRARY_GROUP_BY_STORAGE_KEY);
  return LIBRARY_GROUP_BY_OPTIONS.includes(stored as LibraryGroupBy)
    ? (stored as LibraryGroupBy)
    : "none";
};

const readCollapsedGroups = (): Set<string> => {
  try {
    const parsed: unknown = JSON.parse(
      readStorage(LIBRARY_COLLAPSED_GROUPS_STORAGE_KEY) ?? "[]"
    );
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : []
    );
  } catch {
    return new Set();
  }
};

/** A saved filter as a library view; unreadable parts fall back to defaults. */
const toLibraryView = (savedFilter: SavedLibraryFilter): LibraryView => ({
  tab: savedFilter.tab as LibraryTab,
  filters: parseStoredLibraryFilters(JSON.stringify(savedFilter.filters)),
  installedOnly: savedFilter.installedOnly === true,
  platforms: Array.isArray(savedFilter.platforms) ? savedFilter.platforms : [],
});

const matchesSearch = (title: string, query: string) => {
  const titleLower = removeDiacritics(title).toLowerCase();
  let queryIndex = 0;

  for (let i = 0; i < titleLower.length && queryIndex < query.length; i++) {
    if (titleLower[i] === query[queryIndex]) queryIndex++;
  }

  return queryIndex === query.length;
};

export default function Library() {
  const { library, updateLibrary } = useLibrary();
  const { view, updateView } = useLibraryView();
  const { userDetails } = useUserDetails();
  const navigate = useNavigate();
  const accountId = userDetails?.id ?? null;
  const activeAccountIdRef = useRef(accountId);
  activeAccountIdRef.current = accountId;
  const [hiddenGamesState, setHiddenGamesState] = useState<{
    ownerId: string | null;
    games: LibraryGame[];
  }>({ ownerId: null, games: [] });
  const hiddenGames =
    accountId && hiddenGamesState.ownerId === accountId
      ? hiddenGamesState.games
      : EMPTY_HIDDEN_GAMES;
  const [hiddenGamesLoadFailed, setHiddenGamesLoadFailed] = useState(false);
  const [hiddenGamesLoading, setHiddenGamesLoading] = useState(true);
  const updateHiddenGames = useCallback(async () => {
    if (!accountId) {
      setHiddenGamesState({ ownerId: null, games: [] });
      setHiddenGamesLoading(false);
      return;
    }
    try {
      const games = await window.electron.getHiddenLibrary();
      if (activeAccountIdRef.current === accountId) {
        setHiddenGamesState({ ownerId: accountId, games });
        setHiddenGamesLoadFailed(false);
      }
    } catch {
      if (activeAccountIdRef.current === accountId) {
        setHiddenGamesLoadFailed(true);
      }
    } finally {
      if (activeAccountIdRef.current === accountId) {
        setHiddenGamesLoading(false);
      }
    }
  }, [accountId]);

  const retryHiddenGames = useCallback(async () => {
    setHiddenGamesLoading(true);
    await window.electron.refreshLibraryAssets().catch(() => {});
    if (activeAccountIdRef.current === accountId) {
      await Promise.allSettled([updateLibrary(), updateHiddenGames()]);
    }
  }, [accountId, updateLibrary, updateHiddenGames]);
  useEffect(() => {
    if (accountId) {
      void updateHiddenGames();
    } else {
      setHiddenGamesState({ ownerId: null, games: [] });
      setHiddenGamesLoadFailed(false);
    }
  }, [accountId, updateHiddenGames]);
  const {
    collections,
    loadCollections,
    hasLoaded: hasLoadedCollections,
    hasFailed: hasFailedToLoadCollections,
  } = useGameCollections();
  const [searchParams, setSearchParams] = useSearchParams();
  const { openCollectionContextMenu, openManageCollectionGames } =
    useCollectionContextMenu();

  const [cardSize, setCardSize] = useState(() =>
    readStoredCardSize({ getItem: readStorage })
  );
  const isLargeView = isLargeCardStep(cardSize);
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    const savedSortBy = readStorage("library-sort-by");
    if (savedSortBy && SORT_OPTIONS.includes(savedSortBy as SortOption)) {
      return savedSortBy as SortOption;
    }

    return "title_asc";
  });
  const [groupBy, setGroupBy] = useState<LibraryGroupBy>(readStoredGroupBy);
  const [collapsedGroups, setCollapsedGroups] =
    useState<Set<string>>(readCollapsedGroups);
  const [isDetailsPaneOpen, setIsDetailsPaneOpen] = useState(
    () => readStorage(DETAILS_PANE_STORAGE_KEY) === "true"
  );
  const [selection, setSelection] = useState<LibrarySelection>(EMPTY_SELECTION);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [gameContextMenu, setGameContextMenu] = useState<{
    game: LibraryGame | null;
    visible: boolean;
    position: { x: number; y: number };
  }>({ game: null, visible: false, position: { x: 0, y: 0 } });
  const [collectionModal, setCollectionModal] = useState<{
    visible: boolean;
    savedFilter: SavedLibraryFilter | null;
  }>({ visible: false, savedFilter: null });

  const { tab, filters: libraryFilters, installedOnly, platforms } = view;
  const [isImportingClassics, setIsImportingClassics] = useState(false);

  const [showClassicsOnboarding, setShowClassicsOnboarding] = useState(false);
  const classicsOnboardingTriggeredRef = useRef(false);

  const gamesScrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isGamesScrolled, setIsGamesScrolled] = useState(false);
  const typeAheadRef = useRef<{ text: string; at: number }>({
    text: "",
    at: 0,
  });

  const handleGamesScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      setIsGamesScrolled(event.currentTarget.scrollTop > 0);
    },
    []
  );

  useLayoutEffect(() => {
    const el = gamesScrollRef.current;
    if (!el) return;

    setContainerWidth(el.getBoundingClientRect().width);

    const ro = new ResizeObserver(([entry]) =>
      setContainerWidth(entry.contentRect.width)
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (
      tab === "classics" &&
      !classicsOnboardingTriggeredRef.current &&
      !hasDismissedClassicsOnboarding()
    ) {
      classicsOnboardingTriggeredRef.current = true;
      setShowClassicsOnboarding(true);
    }
  }, [tab]);

  const handleTabChange = useCallback(
    (next: LibraryTab) => updateView({ tab: next }),
    [updateView]
  );

  const searchQuery = useAppSelector((state) => state.library.searchQuery);
  const isLibraryLoading = useAppSelector(selectIsLibraryLoading);
  const runningGameId = useAppSelector(
    (state) => state.gameRunning.gameRunning?.id
  );
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const dispatch = useAppDispatch();
  const { t } = useTranslation(["library", "sidebar"]);

  const selectedCollectionId = searchParams.get("collection");

  const handleCollectionSelect = useCallback(
    (collectionId: string | null) => {
      const params = new URLSearchParams(searchParams);

      if (collectionId) {
        params.set("collection", collectionId);
        writeStorage("library-collection", collectionId);
      } else {
        params.delete("collection");
        try {
          localStorage.removeItem("library-collection");
        } catch {
          // Nothing stored to forget.
        }
      }

      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const hasRestoredCollection = useRef(false);

  useLayoutEffect(() => {
    if (hasRestoredCollection.current) return;
    hasRestoredCollection.current = true;

    if (searchParams.get("collection")) return;

    const savedCollectionId = readStorage("library-collection");
    if (!savedCollectionId) return;

    const params = new URLSearchParams(searchParams);
    params.set("collection", savedCollectionId);
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleCardSizeChange = useCallback((next: number) => {
    setCardSize(next);
    writeStorage(LIBRARY_CARD_SIZE_STORAGE_KEY, String(next));
  }, []);

  const handleSortChange = useCallback((nextSortBy: SortOption) => {
    setSortBy(nextSortBy);
    writeStorage("library-sort-by", nextSortBy);
  }, []);

  const handleGroupByChange = useCallback((next: LibraryGroupBy) => {
    setGroupBy(next);
    writeStorage(LIBRARY_GROUP_BY_STORAGE_KEY, next);
  }, []);

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      writeStorage(
        LIBRARY_COLLAPSED_GROUPS_STORAGE_KEY,
        JSON.stringify([...next])
      );
      return next;
    });
  }, []);

  const handleToggleDetailsPane = useCallback(() => {
    setIsDetailsPaneOpen((previous) => {
      writeStorage(DETAILS_PANE_STORAGE_KEY, String(!previous));
      return !previous;
    });
  }, []);

  useEffect(() => {
    dispatch(setHeaderTitle(t("library")));

    const unsubscribe = window.electron.onLibraryBatchComplete(() => {
      updateLibrary();
      void updateHiddenGames();
      void loadCollections();
    });

    const unsubscribeClassicsImport = window.electron.onClassicsImportStatus(
      (importing) => setIsImportingClassics(importing)
    );

    void window.electron
      .getClassicsImportStatus()
      .then((importing) => setIsImportingClassics(importing));

    window.electron
      .refreshLibraryAssets()
      .catch(() => {})
      .finally(() => {
        const collectionsPromise = hasLoadedCollections
          ? Promise.resolve([])
          : loadCollections();

        void Promise.all([
          updateLibrary(),
          updateHiddenGames(),
          collectionsPromise,
        ]);
      });

    return () => {
      unsubscribe();
      unsubscribeClassicsImport();
    };
  }, [
    dispatch,
    t,
    updateLibrary,
    updateHiddenGames,
    loadCollections,
    hasLoadedCollections,
  ]);

  // Signing in or out swaps local collections for the account's.
  const loadedForAccountRef = useRef(accountId);
  useEffect(() => {
    if (loadedForAccountRef.current === accountId) return;
    loadedForAccountRef.current = accountId;
    void loadCollections();
  }, [accountId, loadCollections]);

  useEffect(() => {
    const refresh = () => {
      void Promise.all([
        updateLibrary(),
        updateHiddenGames(),
        loadCollections(),
      ]);
    };
    window.addEventListener("hydra:game-visibility-updated", refresh);
    return () =>
      window.removeEventListener("hydra:game-visibility-updated", refresh);
  }, [updateLibrary, updateHiddenGames, loadCollections]);

  const handleOpenContextMenu = useCallback(
    (game: LibraryGame, position: { x: number; y: number }) => {
      setGameContextMenu({ game, visible: true, position });
    },
    []
  );

  const handleCloseContextMenu = useCallback(() => {
    setGameContextMenu((prev) => ({ ...prev, visible: false }));
  }, []);

  useEffect(() => {
    const handlePinToggled = () => {
      void updateLibrary();
    };

    window.addEventListener("hydra:game-pin-toggled", handlePinToggled);
    return () => {
      window.removeEventListener("hydra:game-pin-toggled", handlePinToggled);
    };
  }, [updateLibrary]);

  const handleCreateCollectionButtonClick = useCallback(() => {
    setCollectionModal({ visible: true, savedFilter: null });
  }, []);

  const handleSaveFilters = useCallback(() => {
    setCollectionModal({
      visible: true,
      savedFilter: {
        tab,
        filters: { ...libraryFilters },
        installedOnly,
        platforms,
      },
    });
  }, [tab, libraryFilters, installedOnly, platforms]);

  const selectedSavedFilter = useMemo(
    () =>
      collections.find((collection) => collection.id === selectedCollectionId)
        ?.savedFilter ?? null,
    [collections, selectedCollectionId]
  );

  useEffect(() => {
    if (!selectedCollectionId) return;
    if (selectedCollectionId === FAVORITES_COLLECTION_ID) return;
    if (selectedCollectionId === WISHLIST_COLLECTION_ID) return;
    if (selectedCollectionId === HIDDEN_COLLECTION_ID) {
      if (!userDetails) handleCollectionSelect(null);
      return;
    }

    if (hasLoadedCollections) {
      const hasCollection = collections.some(
        (collection) => collection.id === selectedCollectionId
      );

      if (!hasCollection) {
        handleCollectionSelect(null);
      }
      return;
    }

    if (!hasFailedToLoadCollections || library.length === 0) return;

    const isCollectionInLibrary = library.some((game) =>
      getGameCollectionIds(game).includes(selectedCollectionId)
    );

    if (!isCollectionInLibrary) {
      handleCollectionSelect(null);
    }
  }, [
    collections,
    library,
    selectedCollectionId,
    handleCollectionSelect,
    hasLoadedCollections,
    hasFailedToLoadCollections,
    userDetails,
  ]);

  const groupedLibrary = useMemo(
    () => groupLibraryGames(library, runningGameId ? [runningGameId] : []),
    [library, runningGameId]
  );
  const groupedHiddenGames = useMemo(
    () => groupLibraryGames(hiddenGames, runningGameId ? [runningGameId] : []),
    [hiddenGames, runningGameId]
  );
  const sortedLibrary = useMemo(
    () => sortLibraryGames(groupedLibrary, sortBy),
    [groupedLibrary, sortBy]
  );

  const scopeLibrary =
    selectedCollectionId === HIDDEN_COLLECTION_ID
      ? groupedHiddenGames
      : groupedLibrary;
  const { platforms: uniquePlatforms } = useMemo(
    () =>
      getLibraryFilterOptions(
        selectedCollectionId === HIDDEN_COLLECTION_ID ? hiddenGames : library
      ),
    [library, hiddenGames, selectedCollectionId]
  );
  const availableTabs = useMemo(
    () => getAvailableLibraryTabs(groupedLibrary),
    [groupedLibrary]
  );
  const libraryGenres = useMemo(
    () => getLibraryGenres(scopeLibrary),
    [scopeLibrary]
  );
  const hasPlatforms = uniquePlatforms.length > 0;
  const showPlatformFilter = tabShowsPlatforms(tab) && hasPlatforms;

  // A stored Steam or Epic tab falls back to All once those games are gone.
  const effectiveTab: LibraryTab =
    availableTabs.includes(tab) || isLibraryLoading ? tab : "all";

  const filteredLibrary = useMemo(() => {
    let filtered =
      selectedCollectionId === HIDDEN_COLLECTION_ID
        ? userDetails
          ? sortLibraryGames(groupedHiddenGames, sortBy)
          : []
        : sortedLibrary;

    if (selectedCollectionId === FAVORITES_COLLECTION_ID) {
      filtered = filtered.filter((game) => game.favorite);
    } else if (selectedCollectionId === WISHLIST_COLLECTION_ID) {
      filtered = filtered.filter(
        (game) => game.wishlisted && !isGameInstalled(game)
      );
    } else if (selectedSavedFilter) {
      filtered = applyLibraryView(
        filtered,
        toLibraryView(selectedSavedFilter),
        isGameInstalled
      );
    } else if (
      selectedCollectionId &&
      selectedCollectionId !== HIDDEN_COLLECTION_ID
    ) {
      // Hidden games come from the signed-in owner's private list.
      filtered = filtered.filter((game) =>
        getGameCollectionIds(game).includes(selectedCollectionId)
      );
    }

    filtered = applyLibraryView(
      filtered,
      {
        tab: effectiveTab,
        filters: libraryFilters,
        installedOnly,
        platforms: hasPlatforms ? platforms : [],
      },
      isGameInstalled
    );

    const queryLower = removeDiacritics(deferredSearchQuery).toLowerCase();
    if (!queryLower.trim()) return filtered;

    return filtered.filter((game) =>
      matchesSearch(game.title ?? "", queryLower)
    );
  }, [
    sortedLibrary,
    groupedHiddenGames,
    userDetails,
    sortBy,
    deferredSearchQuery,
    selectedCollectionId,
    selectedSavedFilter,
    effectiveTab,
    libraryFilters,
    hasPlatforms,
    platforms,
    installedOnly,
  ]);

  useEffect(() => {
    if (uniquePlatforms.length === 0 || platforms.length === 0) return;

    const availablePlatforms = new Set(uniquePlatforms);
    const nextPlatforms = platforms.filter((platform) =>
      availablePlatforms.has(platform)
    );

    if (nextPlatforms.length !== platforms.length) {
      updateView({ platforms: nextPlatforms });
    }
  }, [uniquePlatforms, platforms, updateView]);

  const favoritesCount = useMemo(() => {
    return groupedLibrary.filter((game) => game.favorite).length;
  }, [groupedLibrary]);
  const wishlistCount = useMemo(
    () =>
      groupedLibrary.filter((game) => game.wishlisted && !isGameInstalled(game))
        .length,
    [groupedLibrary]
  );

  const libraryCollections = useMemo<GameCollection[]>(() => {
    return [
      {
        id: FAVORITES_COLLECTION_ID,
        name: t("favorites"),
        gamesCount: favoritesCount,
      },
      {
        id: WISHLIST_COLLECTION_ID,
        name: t("wishlist"),
        gamesCount: wishlistCount,
      },
      ...(userDetails
        ? [
            {
              id: HIDDEN_COLLECTION_ID,
              name: t("hidden_games"),
              gamesCount: groupedHiddenGames.length,
            },
          ]
        : []),
      ...collections.map((collection) => ({
        ...collection,
        gamesCount: collection.savedFilter
          ? applyLibraryView(
              groupedLibrary,
              toLibraryView(collection.savedFilter),
              isGameInstalled
            ).length
          : groupedLibrary.filter((game) =>
              getGameCollectionIds(game).includes(collection.id)
            ).length,
      })),
    ];
  }, [
    collections,
    groupedLibrary,
    favoritesCount,
    wishlistCount,
    groupedHiddenGames,
    t,
    userDetails,
  ]);

  const columnsCount = useMemo(
    () => getLibraryColumns(containerWidth, cardSize, GAP),
    [containerWidth, cardSize]
  );

  const groups = useMemo(
    () => groupLibrary(filteredLibrary, groupBy, isGameInstalled),
    [filteredLibrary, groupBy]
  );

  const groupLabel = useCallback(
    (value: string) => {
      switch (groupBy) {
        case "play_status":
          return t(`play_status_${value}`);
        case "genre":
          return value || t("group_no_genre");
        case "source":
          return t(`group_source_${value}`);
        case "installed":
          return t(`group_${value}`);
        default:
          return value;
      }
    },
    [groupBy, t]
  );

  const { rows, displayedGames } = useMemo(() => {
    const result: LibraryRow[] = [];
    const shown: LibraryGame[] = [];
    const seen = new Set<string>();

    for (const group of groups) {
      const collapsed = groupBy !== "none" && collapsedGroups.has(group.id);
      if (groupBy !== "none") {
        result.push({
          kind: "header",
          id: group.id,
          label: groupLabel(group.value),
          count: group.games.length,
          collapsed,
        });
      }
      if (collapsed) continue;

      for (let i = 0; i < group.games.length; i += columnsCount) {
        result.push({
          kind: "games",
          id: `${group.id}:${i}`,
          games: group.games.slice(i, i + columnsCount),
        });
      }
      for (const game of group.games) {
        const key = gameKey(game);
        if (seen.has(key)) continue;
        seen.add(key);
        shown.push(game);
      }
    }

    return { rows: result, displayedGames: shown };
  }, [groups, groupBy, collapsedGroups, columnsCount, groupLabel]);

  const displayedKeys = useMemo(
    () => displayedGames.map(gameKey),
    [displayedGames]
  );

  useEffect(() => {
    const visible = new Set(displayedKeys);
    setSelection((previous) => pruneSelection(previous, visible));
    setFocusedKey((previous) =>
      previous && visible.has(previous) ? previous : null
    );
  }, [displayedKeys]);

  const selectedGames = useMemo(
    () => displayedGames.filter((game) => selection.keys.has(gameKey(game))),
    [displayedGames, selection]
  );
  const paneGame = useMemo(() => {
    if (!isDetailsPaneOpen) return null;
    const key = focusedKey ?? selection.anchor;
    return (
      (key && displayedGames.find((game) => gameKey(game) === key)) ?? null
    );
  }, [isDetailsPaneOpen, focusedKey, selection.anchor, displayedGames]);

  const estimatedRowHeight = useMemo(() => {
    if (isLargeView) return LARGE_CARD_ESTIMATED_HEIGHT + GAP;
    const itemWidth =
      containerWidth > 0
        ? (containerWidth - GAP * (columnsCount - 1)) / columnsCount
        : FALLBACK_ITEM_WIDTH;
    return Math.round((itemWidth * 3) / 2) + GAP;
  }, [isLargeView, containerWidth, columnsCount]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => gamesScrollRef.current,
    estimateSize: (index) =>
      rows[index]?.kind === "header" ? GROUP_HEADER_HEIGHT : estimatedRowHeight,
    overscan: 3,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowVirtualizer, estimatedRowHeight, rows]);

  useEffect(() => {
    gamesScrollRef.current?.scrollTo({ top: 0 });
  }, [
    effectiveTab,
    libraryFilters,
    platforms,
    installedOnly,
    sortBy,
    groupBy,
    selectedCollectionId,
  ]);

  const openGamePage = useCallback(
    (game: LibraryGame) =>
      navigate(buildGameDetailsPath({ ...game, ...game.catalogueGame })),
    [navigate]
  );

  const scrollToGame = useCallback(
    (key: string) => {
      const rowIndex = rows.findIndex(
        (row) =>
          row.kind === "games" &&
          row.games.some((game) => gameKey(game) === key)
      );
      if (rowIndex !== -1) rowVirtualizer.scrollToIndex(rowIndex);
    },
    [rows, rowVirtualizer]
  );

  const focusGame = useCallback(
    (key: string) => {
      setFocusedKey(key);
      scrollToGame(key);
    },
    [scrollToGame]
  );

  /** Returns true when the click selected instead of opening the game. */
  const handleCardClick = useCallback(
    (game: LibraryGame, event: React.MouseEvent) => {
      const key = gameKey(game);
      setFocusedKey(key);

      if (event.ctrlKey || event.metaKey) {
        setSelection((previous) => toggleSelection(previous, key));
        return true;
      }
      if (event.shiftKey) {
        setSelection((previous) =>
          selectRange(previous, displayedKeys, key, false)
        );
        return true;
      }
      if (isDetailsPaneOpen) {
        setSelection(selectOnly(key));
        return true;
      }

      setSelection(EMPTY_SELECTION);
      return false;
    },
    [displayedKeys, isDetailsPaneOpen]
  );

  const handleCardDoubleClick = useCallback(
    (game: LibraryGame) => {
      if (isDetailsPaneOpen) openGamePage(game);
    },
    [isDetailsPaneOpen, openGamePage]
  );

  const handleSurpriseMe = useCallback(() => {
    const pool = displayedGames.filter(isGameReadyToPlay);
    const candidates =
      pool.length > 0 ? pool : groupedLibrary.filter(isGameReadyToPlay);
    if (candidates.length === 0) return;

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const key = gameKey(pick);
    if (isDetailsPaneOpen && displayedKeys.includes(key)) {
      setSelection(selectOnly(key));
      focusGame(key);
      return;
    }
    openGamePage(pick);
  }, [
    displayedGames,
    displayedKeys,
    groupedLibrary,
    isDetailsPaneOpen,
    focusGame,
    openGamePage,
  ]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      if (displayedGames.length === 0) return;

      const index = focusedKey ? displayedKeys.indexOf(focusedKey) : -1;

      if (ARROW_KEYS.has(event.key)) {
        event.preventDefault();
        const nextIndex = moveFocus(
          index,
          event.key as LibraryArrowKey,
          groupBy === "none" ? columnsCount : 1,
          displayedGames.length
        );
        const nextKey = displayedKeys[nextIndex];
        if (!nextKey) return;
        if (event.shiftKey) {
          setSelection((previous) =>
            selectRange(
              previous.anchor ? previous : selectOnly(focusedKey ?? nextKey),
              displayedKeys,
              nextKey,
              false
            )
          );
        } else if (isDetailsPaneOpen) {
          setSelection(selectOnly(nextKey));
        }
        focusGame(nextKey);
        return;
      }

      const focused = index === -1 ? null : displayedGames[index];

      if (event.key === "Enter" && focused) {
        event.preventDefault();
        // Ctrl+Enter plays a PC game; anything else opens its page.
        if ((event.ctrlKey || event.metaKey) && focused.executablePath) {
          void window.electron
            .openGame(
              focused.shop,
              focused.objectId,
              focused.executablePath,
              focused.launchOptions
            )
            .catch(() => openGamePage(focused));
          return;
        }
        openGamePage(focused);
        return;
      }

      if (event.key === " " && focused) {
        event.preventDefault();
        setSelection((previous) => toggleSelection(previous, gameKey(focused)));
        return;
      }

      if (event.key === "Escape") {
        setSelection(EMPTY_SELECTION);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelection({ keys: new Set(displayedKeys), anchor: null });
        return;
      }

      if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        const now = Date.now();
        const typed =
          now - typeAheadRef.current.at > TYPE_AHEAD_RESET_MS
            ? event.key
            : typeAheadRef.current.text + event.key;
        typeAheadRef.current = { text: typed, at: now };

        // A repeated single letter moves on to the next title with it.
        const start =
          typed.length === 1 && index !== -1 ? index + 1 : Math.max(0, index);
        const match = findTypeAheadMatch(
          displayedGames.map((game) => game.title ?? ""),
          typed,
          start
        );
        if (match !== -1) {
          const key = displayedKeys[match];
          if (isDetailsPaneOpen) setSelection(selectOnly(key));
          focusGame(key);
        }
      }
    },
    [
      displayedGames,
      displayedKeys,
      focusedKey,
      groupBy,
      columnsCount,
      isDetailsPaneOpen,
      focusGame,
      openGamePage,
    ]
  );

  const hasGames =
    library.length > 0 ||
    (Boolean(userDetails) && hiddenGames.length > 0) ||
    (selectedCollectionId === HIDDEN_COLLECTION_ID && Boolean(userDetails));
  const showControls = hasGames || Boolean(userDetails);
  const hasNoFilteredGames = filteredLibrary.length === 0;
  const isHiddenCollectionSelected =
    selectedCollectionId === HIDDEN_COLLECTION_ID;
  const isFavoritesCollectionSelected =
    selectedCollectionId === FAVORITES_COLLECTION_ID;
  const isWishlistSelected = selectedCollectionId === WISHLIST_COLLECTION_ID;
  const shouldShowFavoritesEmptyState =
    hasGames && isFavoritesCollectionSelected && hasNoFilteredGames;
  const shouldShowWishlistEmptyState =
    hasGames && isWishlistSelected && hasNoFilteredGames;
  const shouldShowCollectionEmptyState =
    hasGames &&
    !shouldShowFavoritesEmptyState &&
    !shouldShowWishlistEmptyState &&
    !selectedSavedFilter &&
    !(
      isHiddenCollectionSelected &&
      (hiddenGamesLoadFailed || hiddenGamesLoading)
    ) &&
    Boolean(selectedCollectionId) &&
    !isFavoritesCollectionSelected &&
    hasNoFilteredGames;
  const shouldShowClassicsImporting =
    effectiveTab === "classics" && isImportingClassics && hasNoFilteredGames;
  const shouldShowNoResultsEmptyState =
    hasGames &&
    hasNoFilteredGames &&
    !shouldShowFavoritesEmptyState &&
    !shouldShowWishlistEmptyState &&
    !shouldShowCollectionEmptyState &&
    !(
      isHiddenCollectionSelected &&
      (hiddenGamesLoadFailed || hiddenGamesLoading)
    ) &&
    !shouldShowClassicsImporting;
  const showGames =
    containerWidth > 0 &&
    hasGames &&
    !shouldShowFavoritesEmptyState &&
    !shouldShowWishlistEmptyState &&
    !shouldShowCollectionEmptyState &&
    !shouldShowClassicsImporting &&
    !shouldShowNoResultsEmptyState;

  const renderCard = (game: LibraryGame) => {
    const key = gameKey(game);
    const props = {
      game,
      onContextMenu: handleOpenContextMenu,
      onCardClick: handleCardClick,
      onCardDoubleClick: handleCardDoubleClick,
      selected: selection.keys.has(key),
      focused: focusedKey === key,
    };
    return isLargeView ? (
      <LibraryGameCardLarge key={key} {...props} />
    ) : (
      <LibraryGameCard key={key} {...props} />
    );
  };

  return (
    <section className="library__content">
      {showControls && (
        <div className="library__page-header">
          <div className="library__controls-row">
            <div className="library__controls-left">
              <CategoryFilter
                tab={effectiveTab}
                tabs={availableTabs}
                onTabChange={handleTabChange}
              />
              <CollectionsFilter
                collections={libraryCollections}
                selectedCollectionId={selectedCollectionId}
                favoritesCollectionId={FAVORITES_COLLECTION_ID}
                hiddenCollectionId={HIDDEN_COLLECTION_ID}
                wishlistCollectionId={WISHLIST_COLLECTION_ID}
                onSelect={handleCollectionSelect}
                onCreate={handleCreateCollectionButtonClick}
                onManageGames={openManageCollectionGames}
                onCollectionContextMenu={openCollectionContextMenu}
              />
              {showPlatformFilter && (
                <PlatformFilter
                  selectedPlatforms={platforms}
                  platforms={uniquePlatforms}
                  onPlatformsChange={(next) => updateView({ platforms: next })}
                />
              )}
              <LibraryFiltersMenu
                filters={libraryFilters}
                genres={libraryGenres}
                showProtonDb={window.electron.platform === "linux"}
                onFiltersChange={(next) => updateView({ filters: next })}
                onSaveFilters={handleSaveFilters}
              />
              <InstalledFilter
                showInstalledOnly={installedOnly}
                onShowInstalledOnlyChange={(next) =>
                  updateView({ installedOnly: next })
                }
              />
            </div>

            <div className="library__controls-right">
              <GroupBySelect
                groupBy={groupBy}
                onGroupByChange={handleGroupByChange}
              />
              <FilterOptions sortBy={sortBy} onSortChange={handleSortChange} />
              <ViewOptions
                cardSize={cardSize}
                onCardSizeChange={handleCardSizeChange}
              />
              <button
                type="button"
                className={`library__tool-button${isDetailsPaneOpen ? " library__tool-button--active" : ""}`}
                onClick={handleToggleDetailsPane}
                aria-pressed={isDetailsPaneOpen}
                title={t("details_pane_tooltip")}
              >
                <SidebarExpandIcon size={16} />
                <span className="library__tool-label">{t("details_pane")}</span>
              </button>
              <button
                type="button"
                className="library__tool-button"
                onClick={handleSurpriseMe}
                title={t("surprise_me_tooltip")}
              >
                <StarIcon size={16} />
                <span className="library__tool-label">{t("surprise_me")}</span>
              </button>
              <button
                type="button"
                className="library__tool-button"
                onClick={() => setShowStats(true)}
                title={t("stats_title")}
              >
                <GraphIcon size={16} />
                <span className="library__tool-label">{t("stats")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {!hasGames && !shouldShowClassicsImporting && !isLibraryLoading && (
        <div className="library__no-games">
          <div className="library__telescope-icon">
            <TelescopeIcon size={24} />
          </div>
          <h2>{t("no_games_title")}</h2>
          <p>{t("no_games_description")}</p>
        </div>
      )}

      {shouldShowClassicsImporting && (
        <div className="library__empty">
          <div className="library__icon-container library__icon-container--spinning">
            <SyncIcon size={24} />
          </div>
          <h2>{t("importing_classics_title")}</h2>
          <p>{t("importing_classics_description")}</p>
        </div>
      )}

      {shouldShowFavoritesEmptyState && (
        <div className="library__empty">
          <div className="library__icon-container">
            <HeartIcon size={24} />
          </div>
          <h2>{t("empty_favorites_title")}</h2>
          <p>{t("empty_favorites_description")}</p>
        </div>
      )}

      {shouldShowWishlistEmptyState && (
        <div className="library__empty">
          <div className="library__icon-container">
            <StarIcon size={24} />
          </div>
          <h2>{t("empty_wishlist_title")}</h2>
          <p>{t("empty_wishlist_description")}</p>
        </div>
      )}

      {shouldShowCollectionEmptyState && (
        <div className="library__empty">
          <div className="library__icon-container">
            <FileDirectoryIcon size={24} />
          </div>
          <h2>
            {t(
              selectedCollectionId === HIDDEN_COLLECTION_ID
                ? "empty_hidden_title"
                : "empty_collection_title"
            )}
          </h2>
          <p>
            {t(
              selectedCollectionId === HIDDEN_COLLECTION_ID
                ? "empty_hidden_description"
                : "empty_collection_description"
            )}
          </p>
        </div>
      )}

      {hasGames && isHiddenCollectionSelected && hiddenGamesLoading && (
        <div className="library__empty">
          <h2>{t("loading")}</h2>
        </div>
      )}

      {hasGames &&
        isHiddenCollectionSelected &&
        hiddenGamesLoadFailed &&
        !hiddenGamesLoading && (
          <div className="library__empty">
            <h2>{t("hidden_games_load_failed")}</h2>
            <button type="button" onClick={() => void retryHiddenGames()}>
              {t("retry_hidden_games")}
            </button>
          </div>
        )}

      {shouldShowNoResultsEmptyState && (
        <div className="library__empty">
          <div className="library__icon-container">
            <SearchIcon size={24} />
          </div>
          <h2>{t("no_results")}</h2>
          <p>{t("no_results_description")}</p>
        </div>
      )}

      <div className="library__body">
        {/* Keys go to the scrolling grid for type-to-find and arrows; a grid
            role would need row and cell roles the virtualised list can't give. */}
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div
          className="library__games-scroll"
          ref={gamesScrollRef}
          onScroll={handleGamesScroll}
          onKeyDown={handleKeyDown}
          // The scrolling grid takes focus for type-to-find and arrow keys;
          // it has no fitting interactive role.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          aria-label={t("library")}
        >
          <div
            className={`library__scroll-shadow${isGamesScrolled ? " library__scroll-shadow--visible" : ""}`}
          />
          {containerWidth > 0 && isLibraryLoading && (
            <LibraryGamesSkeleton
              large={isLargeView}
              columns={columnsCount}
              rows={Math.max(
                2,
                Math.ceil(window.innerHeight / estimatedRowHeight)
              )}
              gap={GAP}
            />
          )}
          {showGames && (
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;

                if (row.kind === "header") {
                  return (
                    <div
                      key={row.id}
                      className="library__group-header"
                      style={{
                        transform: `translateY(${virtualRow.start}px)`,
                        height: GROUP_HEADER_HEIGHT,
                      }}
                    >
                      <button
                        type="button"
                        className="library__group-toggle"
                        onClick={() => toggleGroup(row.id)}
                        aria-expanded={!row.collapsed}
                      >
                        {row.collapsed ? (
                          <ChevronRightIcon size={16} />
                        ) : (
                          <ChevronDownIcon size={16} />
                        )}
                        <span className="library__group-label">
                          {row.label}
                        </span>
                        <span className="library__group-count">
                          {t("group_count", { count: row.count })}
                        </span>
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={row.id}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: GAP,
                      transform: `translateY(${virtualRow.start}px)`,
                      display: "grid",
                      gridTemplateColumns: `repeat(${columnsCount}, 1fr)`,
                      gap: `${GAP}px`,
                    }}
                  >
                    {row.games.map(renderCard)}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {paneGame && (
          <LibraryDetailsPane
            game={paneGame}
            onClose={() => {
              setSelection(EMPTY_SELECTION);
              setFocusedKey(null);
            }}
          />
        )}

        {selectedGames.length > 1 && (
          <LibrarySelectionBar
            games={selectedGames}
            collections={collections}
            onClear={() => setSelection(EMPTY_SELECTION)}
          />
        )}
      </div>

      {gameContextMenu.game && (
        <GameContextMenu
          game={gameContextMenu.game}
          visible={gameContextMenu.visible}
          position={gameContextMenu.position}
          onClose={handleCloseContextMenu}
          onCollectionContextMenu={openCollectionContextMenu}
        />
      )}

      <CreateCollectionModal
        visible={collectionModal.visible}
        savedFilter={collectionModal.savedFilter}
        onClose={() =>
          setCollectionModal({ visible: false, savedFilter: null })
        }
        onCreated={(collection) => {
          if (collection.savedFilter) handleCollectionSelect(collection.id);
        }}
      />

      <LibraryStatsModal
        visible={showStats}
        games={groupedLibrary}
        onClose={() => setShowStats(false)}
      />

      <ClassicsOnboardingModal
        visible={showClassicsOnboarding}
        onClose={() => setShowClassicsOnboarding(false)}
      />
    </section>
  );
}
