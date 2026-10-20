import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { applyLibraryGroupAction } from "@shared";
import type { LibraryGame } from "@types";
import { useLibrary, useToast } from "@renderer/hooks";
import "./game-notes-field.scss";

const SAVE_DELAY_MS = 800;

interface GameNotesFieldProps {
  game: LibraryGame & { members?: LibraryGame[] };
}

/** Free text kept with the game record; saved as you type. */
export function GameNotesField({ game }: Readonly<GameNotesFieldProps>) {
  const { t } = useTranslation("library");
  const { updateLibrary } = useLibrary();
  const { showErrorToast } = useToast();
  const [notes, setNotes] = useState(game.notes ?? "");
  const savedRef = useRef(game.notes ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;

  useEffect(() => {
    // Another game, or the notes changed elsewhere.
    if (timerRef.current) return;
    setNotes(game.notes ?? "");
    savedRef.current = game.notes ?? "";
  }, [game.id, game.notes]);

  const save = async (value: string) => {
    timerRef.current = null;
    if (value === savedRef.current) return;
    const target = gameRef.current;
    try {
      await applyLibraryGroupAction(
        target.members?.length ? target.members : [target],
        (member) =>
          window.electron.setGameNotes(member.shop, member.objectId, value)
      );
      savedRef.current = value;
      await updateLibrary();
    } catch {
      showErrorToast(t("notes_save_failed"));
    }
  };

  const flush = () => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    void save(notes);
  };

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return (
    <label className="game-notes-field">
      <span className="game-notes-field__label">{t("notes")}</span>
      <textarea
        className="game-notes-field__input"
        value={notes}
        placeholder={t("notes_placeholder")}
        maxLength={10_000}
        rows={4}
        onChange={(event) => {
          const value = event.target.value;
          setNotes(value);
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => void save(value), SAVE_DELAY_MS);
        }}
        onBlur={flush}
      />
    </label>
  );
}
