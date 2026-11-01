/**
 * FOMOD installers (`fomod/ModuleConfig.xml`). The main process parses the
 * XML into the `@types` FOMOD types; the wizard and the installer both
 * evaluate them here, so what the user sees is what gets installed.
 */

import type {
  FomodFile,
  FomodPluginType,
  FomodCondition,
  FomodPlugin,
  FomodConfig,
} from "../types/fomod.types.js";

/** A plugin's address in the config: step, group, plugin indexes. */
export const fomodPluginKey = (step: number, group: number, plugin: number) =>
  `${step}.${group}.${plugin}`;

const conditionHolds = (
  condition: FomodCondition,
  flags: Map<string, string>
): boolean => {
  switch (condition.kind) {
    case "flag":
      return (flags.get(condition.flag) ?? "") === condition.value;
    case "file":
      // Other mods' plugins are not tracked; only "Missing" can be known.
      return condition.state === "Missing";
    case "other":
      return true;
    case "group":
      return condition.operator === "Or"
        ? condition.conditions.some((item) => conditionHolds(item, flags))
        : condition.conditions.every((item) => conditionHolds(item, flags));
  }
};

export const resolvePluginType = (
  plugin: FomodPlugin,
  flags: Map<string, string>
): FomodPluginType =>
  plugin.typePatterns.find((pattern) =>
    conditionHolds(pattern.condition, flags)
  )?.type ?? plugin.defaultType;

/** Flags set by the selected plugins of the steps before `untilStep`. */
const collectFlags = (
  config: FomodConfig,
  selected: Set<string>,
  untilStep = config.steps.length
) => {
  const flags = new Map<string, string>();
  config.steps.slice(0, untilStep).forEach((step, stepIndex) => {
    if (step.visible && !conditionHolds(step.visible, flags)) return;
    step.groups.forEach((group, groupIndex) =>
      group.plugins.forEach((plugin, pluginIndex) => {
        if (!selected.has(fomodPluginKey(stepIndex, groupIndex, pluginIndex)))
          return;
        for (const flag of plugin.flags) flags.set(flag.name, flag.value);
      })
    );
  });
  return flags;
};

export const isFomodStepVisible = (
  config: FomodConfig,
  stepIndex: number,
  selected: Set<string>
) => {
  const step = config.steps[stepIndex];
  if (!step?.visible) return true;
  return conditionHolds(
    step.visible,
    collectFlags(config, selected, stepIndex)
  );
};

export interface FomodPluginState {
  type: FomodPluginType;
  /** The user can't change it: required, not usable, or a Select All group. */
  locked: boolean;
}

export const getFomodPluginState = (
  config: FomodConfig,
  stepIndex: number,
  groupIndex: number,
  pluginIndex: number,
  selected: Set<string>
): FomodPluginState => {
  const group = config.steps[stepIndex].groups[groupIndex];
  const plugin = group.plugins[pluginIndex];
  // Flags from this page count too: picking one option can rule out another.
  const type = resolvePluginType(
    plugin,
    collectFlags(config, selected, stepIndex + 1)
  );
  return {
    type,
    locked:
      group.type === "SelectAll" || type === "Required" || type === "NotUsable",
  };
};

/** What a step starts with: required and recommended plugins, one per radio group. */
export const defaultFomodStepSelection = (
  config: FomodConfig,
  stepIndex: number,
  selected: Set<string>
): Set<string> => {
  const next = new Set(selected);
  const flags = collectFlags(config, selected, stepIndex);
  config.steps[stepIndex].groups.forEach((group, groupIndex) => {
    const types = group.plugins.map((plugin) =>
      resolvePluginType(plugin, flags)
    );
    const keys = group.plugins.map((_, pluginIndex) =>
      fomodPluginKey(stepIndex, groupIndex, pluginIndex)
    );
    keys.forEach((key) => next.delete(key));

    if (group.type === "SelectAll") {
      keys.forEach((key) => next.add(key));
      return;
    }
    const picks = keys.filter(
      (_, index) =>
        types[index] === "Required" || types[index] === "Recommended"
    );
    const single =
      group.type === "SelectExactlyOne" || group.type === "SelectAtMostOne";
    if (single) {
      const pick =
        picks[0] ??
        (group.type === "SelectExactlyOne"
          ? keys.find((_, index) => types[index] !== "NotUsable")
          : undefined);
      if (pick) next.add(pick);
      return;
    }
    picks.forEach((key) => next.add(key));
    if (group.type === "SelectAtLeastOne" && picks.length === 0) {
      const first = keys.find((_, index) => types[index] !== "NotUsable");
      if (first) next.add(first);
    }
  });
  return next;
};

/** Clicking a plugin: radio groups swap, the others toggle; locked ones don't move. */
export const toggleFomodPlugin = (
  config: FomodConfig,
  stepIndex: number,
  groupIndex: number,
  pluginIndex: number,
  selected: Set<string>
): Set<string> => {
  const state = getFomodPluginState(
    config,
    stepIndex,
    groupIndex,
    pluginIndex,
    selected
  );
  if (state.locked) return selected;
  const group = config.steps[stepIndex].groups[groupIndex];
  const key = fomodPluginKey(stepIndex, groupIndex, pluginIndex);
  const next = new Set(selected);
  const groupKeys = group.plugins.map((_, index) =>
    fomodPluginKey(stepIndex, groupIndex, index)
  );

  if (group.type === "SelectExactlyOne") {
    groupKeys.forEach((other) => next.delete(other));
    next.add(key);
  } else if (group.type === "SelectAtMostOne") {
    const wasOn = next.has(key);
    groupKeys.forEach((other) => next.delete(other));
    if (!wasOn) next.add(key);
  } else if (next.has(key)) {
    const othersOn = groupKeys.filter(
      (other) => other !== key && next.has(other)
    );
    if (group.type !== "SelectAtLeastOne" || othersOn.length > 0)
      next.delete(key);
  } else {
    next.add(key);
  }
  // An option this pick made unusable comes off.
  config.steps[stepIndex].groups.forEach((other, otherGroup) =>
    other.plugins.forEach((_, otherPlugin) => {
      const otherKey = fomodPluginKey(stepIndex, otherGroup, otherPlugin);
      if (
        next.has(otherKey) &&
        getFomodPluginState(config, stepIndex, otherGroup, otherPlugin, next)
          .type === "NotUsable"
      )
        next.delete(otherKey);
    })
  );
  return next;
};

/**
 * Every file to install for a selection, lowest priority first so a later
 * copy wins: required files, the selected plugins of visible steps, then the
 * conditional files whose flags hold.
 */
export const resolveFomodFiles = (
  config: FomodConfig,
  selected: Set<string>
): FomodFile[] => {
  const files: FomodFile[] = [...config.requiredFiles];
  config.steps.forEach((step, stepIndex) => {
    if (!isFomodStepVisible(config, stepIndex, selected)) return;
    step.groups.forEach((group, groupIndex) =>
      group.plugins.forEach((plugin, pluginIndex) => {
        if (selected.has(fomodPluginKey(stepIndex, groupIndex, pluginIndex)))
          files.push(...plugin.files);
      })
    );
  });
  const flags = collectFlags(config, selected);
  for (const pattern of config.conditionalFiles) {
    if (conditionHolds(pattern.condition, flags)) files.push(...pattern.files);
  }
  return files
    .map((file, order) => ({ file, order }))
    .sort((a, b) => a.file.priority - b.file.priority || a.order - b.order)
    .map(({ file }) => file);
};
