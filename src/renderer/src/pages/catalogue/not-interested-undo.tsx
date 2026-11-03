import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@renderer/components";

import { useNotInterested } from "./use-not-interested";
import "./not-interested-undo.scss";

const VISIBLE_MS = 7000;

/** Says that a game was hidden from suggestions, with a way back. */
export function NotInterestedUndo() {
  const { t } = useTranslation("catalogue");
  const { last, restore, dismissLast } = useNotInterested();

  useEffect(() => {
    if (!last) return;
    const timer = window.setTimeout(dismissLast, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [last, dismissLast]);

  if (!last) return null;

  return (
    <div className="not-interested-undo" role="status">
      <span>{t("not_interested_done", { title: last.title })}</span>
      <Button theme="outline" onClick={() => restore(last)}>
        {t("not_interested_undo")}
      </Button>
    </div>
  );
}
