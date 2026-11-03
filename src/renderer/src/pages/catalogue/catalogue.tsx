import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  GraphIcon,
  HomeIcon,
  SearchIcon,
  type Icon,
} from "@primer/octicons-react";

import { CheckboxField } from "@renderer/components/checkbox-field/checkbox-field";
import { TabStrip } from "@renderer/components/tab-strip/tab-strip";
import {
  setCatalogueTab,
  setDiscoverView,
  type CatalogueTab,
} from "@renderer/features";
import { useAppDispatch, useAppSelector, useLibrary } from "@renderer/hooks";
import { useCatalogue } from "@renderer/hooks/use-catalogue";
import { isGameReadyToPlay } from "@renderer/helpers";
import { isWishlistOnly } from "@shared";

import {
  CATALOGUE_HIDE_OWNED_STORAGE_KEY,
  getCatalogueLibraryStates,
} from "./catalogue-library-state";
import { CatalogueBrowse } from "./catalogue-browse";
import { CatalogueCharts } from "./catalogue-charts";
import { CatalogueForYou } from "./catalogue-for-you";
import { CatalogueFrontPage } from "./catalogue-front-page";
import { NotInterestedUndo } from "./not-interested-undo";
import { catalogueTabScroll } from "./catalogue-tab-scroll";
import "./catalogue.scss";

const TAB_ICONS: Record<CatalogueTab, Icon> = {
  discover: HomeIcon,
  charts: GraphIcon,
  browse: SearchIcon,
};

const RESTORE_SCROLL_MS = 3000;

const readHideOwned = () => {
  try {
    return localStorage.getItem(CATALOGUE_HIDE_OWNED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

/** The store: Discover, Charts and Browse share one page, library state and Hide my games. */
export default function Catalogue() {
  const { t } = useTranslation("catalogue");
  const dispatch = useAppDispatch();
  const tab = useAppSelector((state) => state.catalogueSearch.tab);
  const discoverView = useAppSelector(
    (state) => state.catalogueSearch.discoverView
  );
  const { downloadSources } = useCatalogue();
  const { library } = useLibrary();
  const pageRef = useRef<HTMLDivElement>(null);

  const libraryStates = useMemo(
    () => getCatalogueLibraryStates(library, isGameReadyToPlay, isWishlistOnly),
    [library]
  );

  const [hideOwned, setHideOwned] = useState(readHideOwned);
  const handleHideOwnedChange = (next: boolean) => {
    setHideOwned(next);
    try {
      localStorage.setItem(CATALOGUE_HIDE_OWNED_STORAGE_KEY, String(next));
    } catch {
      /* not persisted */
    }
  };

  // Browse restores its own position with its results. Shelves load after the
  // tab shows, so keep trying while the page grows, until the person scrolls.
  useLayoutEffect(() => {
    const page = pageRef.current;
    if (tab === "browse" || !page) return;

    const target = catalogueTabScroll.get(tab);
    page.scrollTo({ top: target, behavior: "instant" });
    if (target === 0 || page.scrollTop >= target) return;

    const stop = () => {
      observer.disconnect();
      window.clearTimeout(timer);
      page.removeEventListener("wheel", stop);
      page.removeEventListener("touchstart", stop);
      page.removeEventListener("keydown", stop);
    };
    const observer = new ResizeObserver(() => {
      page.scrollTo({ top: target, behavior: "instant" });
      if (page.scrollTop >= target) stop();
    });
    for (const child of Array.from(page.children)) observer.observe(child);
    const timer = window.setTimeout(stop, RESTORE_SCROLL_MS);
    page.addEventListener("wheel", stop, { passive: true });
    page.addEventListener("touchstart", stop, { passive: true });
    page.addEventListener("keydown", stop);
    return stop;
  }, [tab]);

  const handleScroll = useCallback(() => {
    if (tab !== "browse" && pageRef.current) {
      catalogueTabScroll.set(tab, pageRef.current.scrollTop);
    }
  }, [tab]);

  return (
    <div className="catalogue" ref={pageRef} onScroll={handleScroll}>
      <div className="catalogue__tabs">
        <TabStrip
          value={tab}
          onChange={(next) => dispatch(setCatalogueTab(next))}
          options={(["discover", "charts", "browse"] as const).map((value) => {
            const TabIcon = TAB_ICONS[value];
            return {
              value,
              label: t(`tab_${value}`),
              icon: <TabIcon size={14} />,
            };
          })}
        />
        <div className="catalogue__hide-owned" title={t("hide_owned_tooltip")}>
          <CheckboxField
            label={t("hide_owned")}
            checked={hideOwned}
            onChange={(event) => handleHideOwnedChange(event.target.checked)}
          />
        </div>
      </div>

      <div className="catalogue__panel">
        {tab === "discover" && discoverView === "for-you" && (
          <CatalogueForYou
            libraryStates={libraryStates}
            onBack={() => dispatch(setDiscoverView("shelves"))}
          />
        )}
        {tab === "discover" && discoverView === "shelves" && (
          <CatalogueFrontPage
            downloadSources={downloadSources}
            libraryStates={libraryStates}
            hideOwned={hideOwned}
          />
        )}
        {tab === "charts" && (
          <CatalogueCharts
            hideOwned={hideOwned}
            libraryStates={libraryStates}
          />
        )}
        {tab === "browse" && (
          <CatalogueBrowse
            scrollRef={pageRef}
            hideOwned={hideOwned}
            libraryStates={libraryStates}
          />
        )}
      </div>
      <NotInterestedUndo />
    </div>
  );
}
