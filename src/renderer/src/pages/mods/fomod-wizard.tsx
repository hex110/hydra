import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, CheckboxField, Modal, RadioField } from "@renderer/components";
import { logger } from "@renderer/logger";
import {
  defaultFomodStepSelection,
  fomodPluginKey,
  getFomodPluginState,
  isFomodStepVisible,
  toggleFomodPlugin,
} from "@shared";
import type { GameShop, PendingFomodDetails } from "@types";

import { useModActionToast } from "./mods";

interface FomodWizardProps {
  shop: GameShop;
  objectId: string;
  pendingId: string | null;
  onClose: () => void;
  onDone: () => void;
}

const SINGLE_GROUPS = new Set(["SelectExactlyOne", "SelectAtMostOne"]);

/** Steps through a FOMOD installer's pages, then installs the picked options. */
export function FomodWizard({
  shop,
  objectId,
  pendingId,
  onClose,
  onDone,
}: Readonly<FomodWizardProps>) {
  const { t } = useTranslation("mods");
  const reportResult = useModActionToast();
  const [pending, setPending] = useState<PendingFomodDetails | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visited, setVisited] = useState<Set<number>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    setPending(null);
    if (!pendingId) return;
    window.electron
      .getPendingFomod(shop, objectId, pendingId)
      .then((details) => {
        setPending(details);
        const first = details.config.steps.findIndex((_, index) =>
          isFomodStepVisible(details.config, index, new Set())
        );
        const start = Math.max(0, first);
        setStepIndex(start);
        setSelected(
          details.config.steps.length > 0
            ? defaultFomodStepSelection(details.config, start, new Set())
            : new Set()
        );
        setVisited(new Set([start]));
      })
      .catch((error) => {
        logger.error("Failed to read the FOMOD installer", error);
        onClose();
      });
  }, [shop, objectId, pendingId, onClose]);

  const config = pending?.config;
  const visibleSteps = useMemo(
    () =>
      config
        ? config.steps
            .map((_, index) => index)
            .filter((index) => isFomodStepVisible(config, index, selected))
        : [],
    [config, selected]
  );
  const position = visibleSteps.indexOf(stepIndex);
  const nextStep = visibleSteps[position + 1];
  const previousStep = visibleSteps[position - 1];

  const goTo = (index: number) => {
    if (!config) return;
    if (!visited.has(index)) {
      setSelected((current) =>
        defaultFomodStepSelection(config, index, current)
      );
      setVisited((current) => new Set(current).add(index));
    }
    setStepIndex(index);
    setFocus(null);
  };

  const install = async () => {
    if (!pendingId) return;
    setInstalling(true);
    try {
      const result = await window.electron.completeFomod(
        shop,
        objectId,
        pendingId,
        [...selected]
      );
      if (reportResult(result)) onDone();
    } finally {
      setInstalling(false);
    }
  };

  const step = config?.steps[stepIndex];
  const focusedPlugin = (() => {
    if (!step || !focus) return null;
    const [, groupIndex, pluginIndex] = focus.split(".").map(Number);
    return step.groups[groupIndex]?.plugins[pluginIndex] ?? null;
  })();

  return (
    <Modal
      visible={Boolean(pendingId)}
      title={pending?.moduleName || pending?.name || t("fomod_title")}
      description={
        step && visibleSteps.length > 1
          ? t("fomod_step", {
              name: step.name,
              current: position + 1,
              total: visibleSteps.length,
            })
          : step?.name
      }
      onClose={onClose}
      large
    >
      {!pending || !config ? (
        <p className="mods__hint">{t("loading")}</p>
      ) : (
        <div className="mods__fomod">
          <div className="mods__fomod-body">
            <div className="mods__fomod-groups">
              {step ? (
                step.groups.map((group, groupIndex) => (
                  <fieldset key={group.name} className="mods__fomod-group">
                    <legend>
                      {group.name}{" "}
                      <span className="mods__fomod-note">
                        {t(`fomod_group_${group.type}`)}
                      </span>
                    </legend>
                    {group.plugins.map((plugin, pluginIndex) => {
                      const key = fomodPluginKey(
                        stepIndex,
                        groupIndex,
                        pluginIndex
                      );
                      const state = getFomodPluginState(
                        config,
                        stepIndex,
                        groupIndex,
                        pluginIndex,
                        selected
                      );
                      const toggle = () => {
                        setFocus(key);
                        setSelected((current) =>
                          toggleFomodPlugin(
                            config,
                            stepIndex,
                            groupIndex,
                            pluginIndex,
                            current
                          )
                        );
                      };
                      const label = (
                        <span>
                          {plugin.name}
                          {state.type !== "Optional" && (
                            <span className="mods__fomod-note">
                              {" "}
                              {t(`fomod_type_${state.type}`)}
                            </span>
                          )}
                        </span>
                      );
                      return (
                        <div
                          key={key}
                          onMouseEnter={() => setFocus(key)}
                          onFocus={() => setFocus(key)}
                        >
                          {SINGLE_GROUPS.has(group.type) ? (
                            <RadioField
                              name={`fomod-${stepIndex}-${groupIndex}`}
                              label={label}
                              checked={selected.has(key)}
                              disabled={state.locked || installing}
                              onChange={toggle}
                              onClick={() => {
                                // A checked radio fires no change; At most one can be cleared.
                                if (
                                  group.type === "SelectAtMostOne" &&
                                  selected.has(key)
                                )
                                  toggle();
                              }}
                            />
                          ) : (
                            <CheckboxField
                              label={label}
                              checked={selected.has(key)}
                              disabled={state.locked || installing}
                              onChange={toggle}
                            />
                          )}
                        </div>
                      );
                    })}
                  </fieldset>
                ))
              ) : (
                <p className="mods__hint">{t("fomod_no_steps")}</p>
              )}
            </div>
            <aside className="mods__fomod-details">
              {focusedPlugin ? (
                <>
                  {focusedPlugin.image && (
                    <img
                      src={`local:${pending.imageRoot}/${focusedPlugin.image}`}
                      alt=""
                      className="mods__fomod-image"
                    />
                  )}
                  <span className="mods__file-name">{focusedPlugin.name}</span>
                  <p className="mods__fomod-description">
                    {focusedPlugin.description || t("fomod_no_description")}
                  </p>
                </>
              ) : (
                <p className="mods__hint">{t("fomod_pick_hint")}</p>
              )}
            </aside>
          </div>
          <div className="mods__fomod-actions">
            <Button theme="outline" disabled={installing} onClick={onClose}>
              {t("fomod_later")}
            </Button>
            {previousStep !== undefined && (
              <Button
                theme="outline"
                disabled={installing}
                onClick={() => goTo(previousStep)}
              >
                {t("fomod_back")}
              </Button>
            )}
            {nextStep !== undefined ? (
              <Button disabled={installing} onClick={() => goTo(nextStep)}>
                {t("fomod_next")}
              </Button>
            ) : (
              <Button disabled={installing} onClick={() => void install()}>
                {installing ? t("fomod_installing") : t("fomod_install")}
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
