import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { SteamTag } from "@types";
import { clearFilters, setFilters, setMode } from "@renderer/features";
import { useAppDispatch } from "@renderer/hooks";
import {
  EMPTY_LIBRARY_FILTERS,
  LIBRARY_FILTERS_STORAGE_KEY,
} from "@renderer/pages/library/library-filters";
import { SidebarSection } from "../sidebar-section/sidebar-section";
import "./genres-section.scss";

interface GenresSectionProps {
  /** Steam tags; each opens the catalogue filtered to it. */
  tags: SteamTag[];
  /** Genres the user set or the store lists; each opens the library filtered to it. */
  genres: string[];
}

export function GenresSection({ tags, genres }: Readonly<GenresSectionProps>) {
  const { t } = useTranslation("game_details");
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  if (tags.length === 0 && genres.length === 0) return null;

  const showTagInCatalogue = (tag: SteamTag) => {
    dispatch(setMode("modern"));
    dispatch(clearFilters());
    dispatch(setFilters({ tags: [tag.id] }));
    navigate("/catalogue");
  };

  const showGenreInLibrary = (genre: string) => {
    try {
      localStorage.setItem(
        LIBRARY_FILTERS_STORAGE_KEY,
        JSON.stringify({ ...EMPTY_LIBRARY_FILTERS, genres: [genre] })
      );
    } catch {
      // Without storage the library just opens unfiltered.
    }
    navigate("/library");
  };

  return (
    <SidebarSection title={t("genres")}>
      <div className="genres-section">
        {tags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            className="genres-section__genre"
            title={t("show_tag_in_catalogue")}
            onClick={() => showTagInCatalogue(tag)}
          >
            {tag.name}
          </button>
        ))}
        {genres.map((genre) => (
          <button
            key={genre}
            type="button"
            className="genres-section__genre"
            title={t("show_genre_in_library")}
            onClick={() => showGenreInLibrary(genre)}
          >
            {genre}
          </button>
        ))}
      </div>
    </SidebarSection>
  );
}
