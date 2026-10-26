import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { orderBy } from "lodash-es";

import { Button, SelectField, TextField } from "@renderer/components";
import { gameDetailsContext } from "@renderer/context";
import { useToast } from "@renderer/hooks";
import languageResources from "@locales";
import { getGenreNames } from "@shared";
import type { GameMetadataOverrides, LibraryGame } from "@types";

import { FloppyMatchSection } from "./floppy-match-section";
import { SteamPlaytimeSection } from "./steam-playtime-section";

const LANGUAGE_OPTIONS = orderBy(
  Object.entries(languageResources).map(([language, value]) => ({
    value: language,
    label: value.language_name as string,
  })),
  ["label"],
  "asc"
);

const parseGenres = (value: string) =>
  value
    .split(",")
    .map((genre) => genre.trim())
    .filter(Boolean);

/** The user's own description, genres and store-details language for a game. */
export function DetailsSection({ game }: Readonly<{ game: LibraryGame }>) {
  const { t } = useTranslation("game_details");
  const { updateGame, shopDetails } = useContext(gameDetailsContext);
  const { showSuccessToast, showErrorToast } = useToast();

  const [description, setDescription] = useState(game.customDescription ?? "");
  const [genres, setGenres] = useState((game.customGenres ?? []).join(", "));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDescription(game.customDescription ?? "");
    setGenres((game.customGenres ?? []).join(", "));
  }, [game.customDescription, game.customGenres]);

  const save = async (overrides: GameMetadataOverrides) => {
    setIsSaving(true);
    try {
      await window.electron.updateGameMetadata(
        game.shop,
        game.objectId,
        overrides
      );
      await updateGame();
      showSuccessToast(t("details_saved"));
    } catch {
      showErrorToast(t("details_save_failed"));
    } finally {
      setIsSaving(false);
    }
  };

  const storeGenres = getGenreNames(shopDetails?.genres);
  const isDirty =
    description.trim() !== (game.customDescription ?? "") ||
    parseGenres(genres).join(",") !== (game.customGenres ?? []).join(",");

  return (
    <div className="game-options-modal__section">
      <div className="game-options-modal__header">
        <h2>{t("details_section_title")}</h2>
        <h4 className="game-options-modal__header-description">
          {t("details_section_description")}
        </h4>
      </div>

      <label className="game-options-modal__details-field">
        <span>{t("details_description")}</span>
        <textarea
          className="game-options-modal__textarea"
          value={description}
          rows={8}
          placeholder={t("details_description_placeholder")}
          disabled={isSaving}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <TextField
        label={t("details_genres")}
        placeholder={
          storeGenres.length > 0
            ? storeGenres.join(", ")
            : t("details_genres_placeholder")
        }
        hint={t("details_genres_hint")}
        value={genres}
        onChange={(event) => setGenres(event.target.value)}
        theme="dark"
        disabled={isSaving}
      />

      <div className="game-options-modal__row">
        <Button
          theme="primary"
          disabled={isSaving || !isDirty}
          onClick={() =>
            void save({
              customDescription: description,
              customGenres: parseGenres(genres),
            })
          }
        >
          {t("details_save")}
        </Button>
        <Button
          theme="outline"
          disabled={
            isSaving || (!game.customDescription && !game.customGenres?.length)
          }
          onClick={() =>
            void save({ customDescription: null, customGenres: null })
          }
        >
          {t("details_reset")}
        </Button>
      </div>

      <SelectField
        label={t("details_language")}
        value={game.metadataLanguage ?? ""}
        disabled={isSaving}
        onChange={(event) =>
          void save({ metadataLanguage: event.target.value || null })
        }
        options={[
          { key: "", value: "", label: t("details_language_app") },
          ...LANGUAGE_OPTIONS.map((language) => ({
            key: language.value,
            value: language.value,
            label: language.label,
          })),
        ]}
      />
      <p className="game-options-modal__optiscaler-hint">
        {t("details_language_hint")}
      </p>

      <SteamPlaytimeSection game={game} />
      <FloppyMatchSection game={game} />
    </div>
  );
}
