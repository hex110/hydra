import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@renderer/hooks";

/** Tells the person where to go when AnkerGames' download page opens in their browser. */
export function AnkerGamesBrowserNotice() {
  const { t } = useTranslation("game_details");
  const { showSuccessToast } = useToast();

  useEffect(
    () =>
      window.electron.onAnkerGamesBrowserOpened((title) =>
        showSuccessToast(
          t("ankergames_browser_opened_title", { title }),
          t("ankergames_browser_opened"),
          12_000
        )
      ),
    [showSuccessToast, t]
  );

  return null;
}
