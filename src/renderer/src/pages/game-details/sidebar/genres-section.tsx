import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  EMPTY_LIBRARY_FILTERS,
  LIBRARY_FILTERS_STORAGE_KEY,
} from "@renderer/pages/library/library-filters";
import { SidebarSection } from "../sidebar-section/sidebar-section";
import "./genres-section.scss";

interface GenresSectionProps {
  genres: string[];
}

export function GenresSection({ genres }: Readonly<GenresSectionProps>) {
  const { t } = useTranslation("game_details");
  const navigate = useNavigate();

  if (genres.length === 0) return null;

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
