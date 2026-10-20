import { useTranslation } from "react-i18next";
import { ArrowDownIcon, ArrowUpIcon } from "@primer/octicons-react";
import { Button, CheckboxField, Modal } from "@renderer/components";
import {
  DEFAULT_HOME_SHELF_LAYOUT,
  moveHomeShelf,
  toggleHomeShelf,
  type HomeShelfLayout,
} from "./home-shelves";
import "./home-customise-modal.scss";

interface HomeCustomiseModalProps {
  visible: boolean;
  layout: HomeShelfLayout;
  onChange: (layout: HomeShelfLayout) => void;
  onClose: () => void;
}

export function HomeCustomiseModal({
  visible,
  layout,
  onChange,
  onClose,
}: Readonly<HomeCustomiseModalProps>) {
  const { t } = useTranslation("home");

  return (
    <Modal
      visible={visible}
      title={t("customise_home")}
      description={t("customise_home_description")}
      onClose={onClose}
    >
      <ul className="home-customise">
        {layout.order.map((id, index) => (
          <li key={id} className="home-customise__item">
            <CheckboxField
              label={t(`shelf_${id}`)}
              checked={!layout.hidden.includes(id)}
              onChange={() => onChange(toggleHomeShelf(layout, id))}
            />
            <div className="home-customise__moves">
              <button
                type="button"
                className="home-customise__move"
                disabled={index === 0}
                onClick={() => onChange(moveHomeShelf(layout, id, -1))}
                aria-label={t("move_shelf_up", { shelf: t(`shelf_${id}`) })}
                title={t("move_up")}
              >
                <ArrowUpIcon size={14} />
              </button>
              <button
                type="button"
                className="home-customise__move"
                disabled={index === layout.order.length - 1}
                onClick={() => onChange(moveHomeShelf(layout, id, 1))}
                aria-label={t("move_shelf_down", { shelf: t(`shelf_${id}`) })}
                title={t("move_down")}
              >
                <ArrowDownIcon size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="home-customise__actions">
        <Button
          theme="outline"
          onClick={() => onChange(DEFAULT_HOME_SHELF_LAYOUT)}
        >
          {t("reset_home")}
        </Button>
        <Button onClick={onClose}>{t("done")}</Button>
      </div>
    </Modal>
  );
}
