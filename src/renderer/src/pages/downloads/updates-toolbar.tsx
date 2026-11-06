import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SyncIcon } from "@primer/octicons-react";

import { Button } from "@renderer/components";
import { useDate, useLibrary } from "@renderer/hooks";

import "./updates-toolbar.scss";

/** The manual update check, with when the last one finished. */
export function UpdatesToolbar() {
  const { t } = useTranslation("downloads");
  const { formatDistance } = useDate();
  const { updateLibrary } = useLibrary();
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  useEffect(() => {
    const loadCheckedAt = () =>
      window.electron.getGameUpdatesCheckedAt().then(setCheckedAt);

    void window.electron.isCheckingGameUpdates().then(setChecking);
    void loadCheckedAt();

    return window.electron.onGameUpdatesChecking((value) => {
      setChecking(value);
      if (!value) {
        void loadCheckedAt();
        void updateLibrary();
      }
    });
  }, [updateLibrary]);

  const check = async () => {
    setChecking(true);
    await window.electron.checkGameUpdates().finally(() => setChecking(false));
    void updateLibrary();
  };

  return (
    <div className="updates-toolbar">
      {checkedAt !== null && !checking && (
        <span className="updates-toolbar__checked">
          {t("checked_ago", {
            time: formatDistance(checkedAt, Date.now(), { addSuffix: true }),
          })}
        </span>
      )}
      <Button theme="outline" size="small" onClick={check} disabled={checking}>
        <SyncIcon
          size={14}
          className={checking ? "updates-toolbar__spinner" : undefined}
        />
        {checking ? t("checking_game_updates") : t("check_game_updates")}
      </Button>
    </div>
  );
}
