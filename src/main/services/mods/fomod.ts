import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";

import { resolveFomodFiles } from "../../../shared/fomod.js";
import type {
  FomodCondition,
  FomodConfig,
  FomodFile,
  FomodGroup,
  FomodGroupType,
  FomodPlugin,
  FomodPluginType,
  FomodStep,
} from "../../../types/fomod.types.js";

type XmlNode = Record<string, unknown>;

const ARRAY_ELEMENTS = new Set([
  "installStep",
  "group",
  "plugin",
  "file",
  "folder",
  "flag",
  "pattern",
  "flagDependency",
  "fileDependency",
  "gameDependency",
  "fommDependency",
  "foseDependency",
  "dependencies",
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ARRAY_ELEMENTS.has(name),
});

/** ModuleConfig.xml is often UTF-16 (with or without a byte order mark). */
export const decodeXml = (buffer: Buffer): string => {
  if (buffer[0] === 0xff && buffer[1] === 0xfe)
    return buffer.subarray(2).toString("utf16le");
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf)
    return buffer.subarray(3).toString("utf8");
  if (buffer.length > 1 && buffer[1] === 0) return buffer.toString("utf16le");
  return buffer.toString("utf8");
};

const list = (value: unknown): XmlNode[] =>
  Array.isArray(value)
    ? (value as XmlNode[])
    : value && typeof value === "object"
      ? [value as XmlNode]
      : [];

const attribute = (node: XmlNode | undefined, name: string) => {
  const value = node?.[`@_${name}`];
  return typeof value === "string" ? value : undefined;
};

const text = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "#text" in value)
    return String((value as XmlNode)["#text"] ?? "");
  return "";
};

const toPath = (value: string | undefined) =>
  (value ?? "").replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");

const parseFiles = (node: unknown): FomodFile[] => {
  const container = node as XmlNode | undefined;
  if (!container) return [];
  const read = (items: unknown, isFolder: boolean) =>
    list(items).map((item) => {
      const source = toPath(attribute(item, "source"));
      const rawDestination = attribute(item, "destination");
      // A missing destination means "same path as the source".
      const destination =
        rawDestination === undefined
          ? source
          : isFolder || toPath(rawDestination)
            ? toPath(rawDestination)
            : path.posix.basename(source);
      return {
        source,
        destination,
        isFolder,
        priority: Number(attribute(item, "priority") ?? 0) || 0,
      };
    });
  return [...read(container.file, false), ...read(container.folder, true)];
};

const FILE_STATES = new Set(["Active", "Inactive", "Missing"]);

const parseCondition = (node: XmlNode | undefined): FomodCondition => {
  if (!node) return { kind: "other" };
  const conditions: FomodCondition[] = [
    ...list(node.flagDependency).map(
      (item): FomodCondition => ({
        kind: "flag",
        flag: attribute(item, "flag") ?? "",
        value: attribute(item, "value") ?? "",
      })
    ),
    ...list(node.fileDependency).map((item): FomodCondition => {
      const state = attribute(item, "state") ?? "Active";
      return {
        kind: "file",
        file: attribute(item, "file") ?? "",
        state: (FILE_STATES.has(state) ? state : "Active") as
          | "Active"
          | "Inactive"
          | "Missing",
      };
    }),
    ...[
      ...list(node.gameDependency),
      ...list(node.fommDependency),
      ...list(node.foseDependency),
    ].map((): FomodCondition => ({ kind: "other" })),
    ...list(node.dependencies).map(parseCondition),
  ];
  return {
    kind: "group",
    operator: attribute(node, "operator") === "Or" ? "Or" : "And",
    conditions,
  };
};

const PLUGIN_TYPES = new Set([
  "Required",
  "Optional",
  "Recommended",
  "NotUsable",
  "CouldBeUsable",
]);

const pluginType = (node: XmlNode | undefined): FomodPluginType => {
  const name = attribute(node, "name") ?? "Optional";
  return (PLUGIN_TYPES.has(name) ? name : "Optional") as FomodPluginType;
};

/** FOMOD lists sort by name unless they say `order="Explicit"`. */
const ordered = <T extends { name: string }>(items: T[], order?: string) =>
  order === "Explicit" || order === "Descending"
    ? order === "Descending"
      ? items.toSorted((a, b) => b.name.localeCompare(a.name))
      : items
    : items.toSorted((a, b) => a.name.localeCompare(b.name));

const parsePlugin = (node: XmlNode): FomodPlugin => {
  const descriptor = node.typeDescriptor as XmlNode | undefined;
  const dependencyType = descriptor?.dependencyType as XmlNode | undefined;
  return {
    name: attribute(node, "name") ?? "",
    description: text(node.description).trim(),
    image: attribute(node.image as XmlNode | undefined, "path")
      ? toPath(attribute(node.image as XmlNode, "path"))
      : null,
    files: parseFiles(node.files),
    flags: list((node.conditionFlags as XmlNode | undefined)?.flag).map(
      (flag) => ({ name: attribute(flag, "name") ?? "", value: text(flag) })
    ),
    defaultType: dependencyType
      ? pluginType(dependencyType.defaultType as XmlNode)
      : pluginType(descriptor?.type as XmlNode | undefined),
    typePatterns: list(
      (dependencyType?.patterns as XmlNode | undefined)?.pattern
    ).map((pattern) => ({
      condition: parseCondition(list(pattern.dependencies)[0]),
      type: pluginType(pattern.type as XmlNode),
    })),
  };
};

const GROUP_TYPES = new Set([
  "SelectExactlyOne",
  "SelectAtMostOne",
  "SelectAtLeastOne",
  "SelectAll",
  "SelectAny",
]);

const parseGroup = (node: XmlNode): FomodGroup => {
  const type = attribute(node, "type") ?? "SelectAny";
  const plugins = node.plugins as XmlNode | undefined;
  return {
    name: attribute(node, "name") ?? "",
    type: (GROUP_TYPES.has(type) ? type : "SelectAny") as FomodGroupType,
    plugins: ordered(
      list(plugins?.plugin).map(parsePlugin),
      attribute(plugins, "order")
    ),
  };
};

const parseVisible = (node: XmlNode | undefined): FomodCondition | null => {
  if (!node) return null;
  const nested = list(node.dependencies);
  return nested.length === 1 && !node.flagDependency && !node.fileDependency
    ? parseCondition(nested[0])
    : parseCondition(node);
};

export const parseModuleConfig = (xml: string): FomodConfig => {
  const document = parser.parse(xml) as XmlNode;
  const config = (document.config ?? {}) as XmlNode;
  const steps = config.installSteps as XmlNode | undefined;
  const conditional = config.conditionalFileInstalls as XmlNode | undefined;

  return {
    moduleName: text(config.moduleName).trim(),
    requiredFiles: parseFiles(config.requiredInstallFiles),
    steps: ordered(
      list(steps?.installStep).map((step): FomodStep => {
        const groups = step.optionalFileGroups as XmlNode | undefined;
        return {
          name: attribute(step, "name") ?? "",
          visible: parseVisible(step.visible as XmlNode | undefined),
          groups: ordered(
            list(groups?.group).map(parseGroup),
            attribute(groups, "order")
          ),
        };
      }),
      attribute(steps, "order")
    ),
    conditionalFiles: list(
      (conditional?.patterns as XmlNode | undefined)?.pattern
    ).map((pattern) => ({
      condition: parseCondition(list(pattern.dependencies)[0]),
      files: parseFiles(pattern.files),
    })),
  };
};

/** The folder holding `fomod/ModuleConfig.xml`, relative to the extract. */
export const findFomodRoot = (files: string[]): string | null => {
  for (const file of files) {
    const match = /^(.*?)(?:^|\/)fomod\/moduleconfig\.xml$/i.exec(file);
    if (match) return match[1].replace(/\/$/, "");
  }
  return null;
};

export const readFomodConfig = async (
  extractRoot: string,
  files: string[]
): Promise<{ root: string; config: FomodConfig } | null> => {
  const rootRelative = findFomodRoot(files);
  if (rootRelative === null) return null;
  const configFile = files.find((file) =>
    new RegExp(
      `^${rootRelative ? `${rootRelative.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/` : ""}fomod/moduleconfig\\.xml$`,
      "i"
    ).test(file)
  );
  if (!configFile) return null;
  const xml = decodeXml(
    await fs.promises.readFile(path.join(extractRoot, configFile))
  );
  const config = parseModuleConfig(xml);
  if (config.steps.length === 0 && config.requiredFiles.length === 0)
    return null;
  return { root: path.join(extractRoot, rootRelative), config };
};

/** Finds `relative` under `root` whatever the case of each part. */
const resolveCaseInsensitive = async (root: string, relative: string) => {
  let current = root;
  for (const part of relative.split("/").filter(Boolean)) {
    const direct = path.join(current, part);
    if (
      await fs.promises
        .access(direct)
        .then(() => true)
        .catch(() => false)
    ) {
      current = direct;
      continue;
    }
    const entries = await fs.promises.readdir(current).catch(() => []);
    const found = entries.find(
      (entry) => entry.toLowerCase() === part.toLowerCase()
    );
    if (!found) return null;
    current = path.join(current, found);
  }
  return current;
};

const copyInto = async (source: string, target: string) => {
  const stats = await fs.promises.stat(source);
  if (stats.isDirectory()) {
    await fs.promises.mkdir(target, { recursive: true });
    for (const entry of await fs.promises.readdir(source)) {
      await copyInto(path.join(source, entry), path.join(target, entry));
    }
    return;
  }
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.copyFile(source, target);
};

/** Builds the mod's staging folder from the chosen options. Returns missing sources. */
export const applyFomod = async (
  root: string,
  config: FomodConfig,
  selected: Set<string>,
  outDir: string
): Promise<string[]> => {
  const missing: string[] = [];
  await fs.promises.mkdir(outDir, { recursive: true });
  for (const file of resolveFomodFiles(config, selected)) {
    const source = await resolveCaseInsensitive(root, file.source);
    if (!source) {
      missing.push(file.source);
      continue;
    }
    await copyInto(source, path.join(outDir, file.destination));
  }
  return missing;
};
