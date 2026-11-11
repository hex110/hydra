import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, CheckboxField, Modal } from "@renderer/components";
import type { Game } from "@types";
import "./remove-from-library-modal.scss";

interface RemoveGameFromLibraryModalProps {
  visible: boolean;
  game: Pick<Game, "title" | "executablePath">;
  onClose: () => void;
  removeGameFromLibrary: (options: {
    ignoreExecutable: boolean;
  }) => Promise<void>;
}

export function RemoveGameFromLibraryModal({
  onClose,
  game,
  visible,
  removeGameFromLibrary,
}: RemoveGameFromLibraryModalProps) {
  const { t } = useTranslation("game_details");

  const [ignoreExecutable, setIgnoreExecutable] = useState(false);

  const handleRemoveGame = async () => {
    await removeGameFromLibrary({
      ignoreExecutable: ignoreExecutable && !!game.executablePath,
    });
    setIgnoreExecutable(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      title={t("remove_from_library_title")}
      description={t("remove_from_library_description", { game: game.title })}
      onClose={onClose}
    >
      {game.executablePath && (
        <CheckboxField
          label={t("remove_from_library_ignore")}
          checked={ignoreExecutable}
          onChange={() => setIgnoreExecutable(!ignoreExecutable)}
        />
      )}

      <div className="remove-from-library-modal__actions">
        <Button onClick={onClose} theme="outline">
          {t("cancel")}
        </Button>

        <Button onClick={handleRemoveGame} theme="danger">
          {t("remove")}
        </Button>
      </div>
    </Modal>
  );
}
