import { ImageIcon, RowsIcon } from "@primer/octicons-react";
import { useTranslation } from "react-i18next";
import {
  isLargeCardStep,
  LIBRARY_CARD_SIZE_STEPS,
  LIBRARY_LARGE_CARD_STEP,
} from "./library-card-size";
import "./view-options.scss";

interface ViewOptionsProps {
  cardSize: number;
  onCardSizeChange: (cardSize: number) => void;
}

/** Cover size, smallest on the left; the last step shows wide cards. */
export function ViewOptions({
  cardSize,
  onCardSizeChange,
}: Readonly<ViewOptionsProps>) {
  const { t } = useTranslation("library");
  const label = isLargeCardStep(cardSize)
    ? t("card_size_wide")
    : t("card_size_value", { step: cardSize + 1 });

  return (
    <label
      className="library-view-options__container"
      title={`${t("card_size")}: ${label}`}
    >
      <ImageIcon size={14} className="library-view-options__icon" />
      <input
        type="range"
        className="library-view-options__slider"
        min={0}
        max={LIBRARY_CARD_SIZE_STEPS - 1}
        step={1}
        value={cardSize}
        aria-label={t("card_size")}
        aria-valuetext={label}
        onChange={(event) => onCardSizeChange(Number(event.target.value))}
      />
      <RowsIcon
        size={14}
        className={`library-view-options__icon${cardSize === LIBRARY_LARGE_CARD_STEP ? " library-view-options__icon--active" : ""}`}
      />
    </label>
  );
}
