import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, Modal } from "@renderer/components";
import { useToast } from "@renderer/hooks";
import { logger } from "@renderer/logger";
import type { GameShop, ModActionResult, ModOrderProposal } from "@types";

interface ModOrderSortProps {
  shop: GameShop;
  objectId: string;
  disabled: boolean;
  run: (action: () => Promise<ModActionResult | null>) => Promise<void>;
}

/**
 * Sort by dependencies: Hydra proposes the order the mods' dependencies ask
 * for and changes nothing until the user applies it. Manual moves after that
 * stay as they are.
 */
export function ModOrderSort({
  shop,
  objectId,
  disabled,
  run,
}: Readonly<ModOrderSortProps>) {
  const { t } = useTranslation("mods");
  const { showSuccessToast, showErrorToast } = useToast();
  const [proposal, setProposal] = useState<ModOrderProposal | null>(null);
  const [loading, setLoading] = useState(false);

  const propose = async () => {
    setLoading(true);
    try {
      const next = await window.electron.proposeModDependencyOrder(
        shop,
        objectId
      );
      if (next.unchanged && next.cycles.length === 0)
        showSuccessToast(t("order_already_sorted"));
      else setProposal(next);
    } catch (error) {
      logger.error("Failed to sort mods by dependencies", error);
      showErrorToast(t("order_sort_failed"));
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!proposal) return;
    const order = proposal.order;
    setProposal(null);
    await run(() =>
      window.electron.applyModDependencyOrder(shop, objectId, order)
    );
  };

  return (
    <>
      <Button
        theme="outline"
        disabled={disabled || loading}
        onClick={() => void propose()}
      >
        {t("order_sort")}
      </Button>

      <Modal
        visible={proposal !== null}
        title={t("order_sort_title")}
        description={t("order_sort_description")}
        onClose={() => setProposal(null)}
      >
        <div className="mods__order-proposal">
          {proposal && proposal.changes.length > 0 && (
            <ul className="mods__order-changes">
              {proposal.changes.map((change) => (
                <li key={`${change.modName}>${change.beforeName}`}>
                  {t("order_change", {
                    mod: change.modName,
                    before: change.beforeName,
                    reason: change.reason,
                  })}
                </li>
              ))}
            </ul>
          )}
          {proposal?.unchanged && <p>{t("order_no_moves")}</p>}
          {proposal?.cycles.map((cycle) => (
            <p key={cycle.join(">")} className="mods__state--error">
              {t("order_cycle", { names: cycle.join(", ") })}
            </p>
          ))}
          <div className="mods__order-actions">
            <Button theme="outline" onClick={() => setProposal(null)}>
              {t("profile_cancel")}
            </Button>
            {proposal && !proposal.unchanged && (
              <Button theme="primary" onClick={() => void apply()}>
                {t("order_apply")}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
