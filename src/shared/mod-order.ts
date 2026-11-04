import type {
  InstalledMod,
  ModOrderChange,
  ModOrderProposal,
} from "../types/mods.types.js";

/** One ordering fact: `first` must load before `then`. */
interface OrderEdge {
  first: string;
  then: string;
  source: string;
}

/** What a mod's own files and Hydra's records say about its order. */
export interface ModDependencyInfo {
  /** Ids the mod answers to, lower-case: `smapi:<UniqueID>`, `rimworld:<packageId>`… */
  provides: string[];
  /** Ids that load before it. */
  after: { id: string; source: string }[];
  /** Ids that load after it. */
  before: { id: string; source: string }[];
}

const emptyInfo = (): ModDependencyInfo => ({
  provides: [],
  after: [],
  before: [],
});

/** JSON as mod authors write it: with comments and trailing commas. */
const parseLenientJson = (text: string): unknown => {
  const cleaned = text
    .replace(/^\uFEFF/, "")
    .replaceAll(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, s) =>
      s ? s : ""
    )
    .replaceAll(/,(\s*[}\]])/g, "$1");
  return JSON.parse(cleaned);
};

const id = (kind: string, value: string) =>
  `${kind}:${value.trim().toLowerCase()}`;

/**
 * A SMAPI mod's `manifest.json`: its `UniqueID`, required `Dependencies`, and
 * the mod a content pack is for. A Thunderstore package's `manifest.json`:
 * its `name` and `dependencies` (`Author-Name-1.0.0`).
 */
export const parseModManifest = (text: string): ModDependencyInfo | null => {
  let data: Record<string, unknown>;
  try {
    data = parseLenientJson(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const info = emptyInfo();

  const uniqueId = data.UniqueID ?? data.uniqueID ?? data.UniqueId;
  if (typeof uniqueId === "string") {
    info.provides.push(id("smapi", uniqueId));
    const dependencies = Array.isArray(data.Dependencies)
      ? (data.Dependencies as Record<string, unknown>[])
      : [];
    for (const dependency of dependencies) {
      if (typeof dependency?.UniqueID !== "string") continue;
      if (dependency.IsRequired === false) continue;
      info.after.push({
        id: id("smapi", dependency.UniqueID),
        source: "its manifest.json Dependencies",
      });
    }
    const pack = data.ContentPackFor as Record<string, unknown> | undefined;
    if (typeof pack?.UniqueID === "string")
      info.after.push({
        id: id("smapi", pack.UniqueID),
        source: "its manifest.json ContentPackFor",
      });
    return info;
  }

  if (typeof data.name === "string" && Array.isArray(data.dependencies)) {
    info.provides.push(id("thunderstore", data.name));
    for (const dependency of data.dependencies) {
      if (typeof dependency !== "string") continue;
      // Thunderstore names have no dashes: Author-Name-Version.
      const name = dependency.split("-")[1];
      if (name)
        info.after.push({
          id: id("thunderstore", name),
          source: "its Thunderstore manifest.json dependencies",
        });
    }
    return info;
  }
  return null;
};

const listItems = (xml: string, tag: string) => {
  const block = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  if (!block) return [];
  return [...block[1].matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((item) => {
    const packageId = /<packageId>([^<]+)<\/packageId>/i.exec(item[1]);
    return (packageId ? packageId[1] : item[1]).trim();
  });
};

/** A RimWorld mod's `About/About.xml`: packageId, dependencies, loadAfter, loadBefore. */
export const parseRimWorldAbout = (xml: string): ModDependencyInfo | null => {
  const withoutLists = xml.replaceAll(
    /<(modDependencies|modDependenciesByVersion|loadAfter|loadBefore|forceLoadAfter|forceLoadBefore|incompatibleWith)>[\s\S]*?<\/\1>/gi,
    ""
  );
  const packageId = /<packageId>([^<]+)<\/packageId>/i.exec(withoutLists)?.[1];
  if (!packageId) return null;
  const info = emptyInfo();
  info.provides.push(id("rimworld", packageId));
  for (const dependency of listItems(xml, "modDependencies"))
    info.after.push({
      id: id("rimworld", dependency),
      source: "its About.xml modDependencies",
    });
  for (const after of [
    ...listItems(xml, "loadAfter"),
    ...listItems(xml, "forceLoadAfter"),
  ])
    info.after.push({
      id: id("rimworld", after),
      source: "its About.xml loadAfter",
    });
  for (const before of [
    ...listItems(xml, "loadBefore"),
    ...listItems(xml, "forceLoadBefore"),
  ])
    info.before.push({
      id: id("rimworld", before),
      source: "its About.xml loadBefore",
    });
  return info;
};

/** Adds what Hydra itself knows: Nexus requirements and the loader. */
export const withRecordedDependencies = (
  mod: Pick<InstalledMod, "source" | "requirements" | "needsLoader">,
  info: ModDependencyInfo
): ModDependencyInfo => {
  const merged: ModDependencyInfo = {
    provides: [...info.provides],
    after: [...info.after],
    before: [...info.before],
  };
  if (mod.source.kind === "nexus")
    merged.provides.push(`nexus:${mod.source.modId}`);
  for (const requirement of mod.requirements ?? [])
    if (requirement.modId !== null)
      merged.after.push({
        id: `nexus:${requirement.modId}`,
        source: "its Nexus page's requirements",
      });
  if (mod.needsLoader)
    merged.after.push({
      id: `loader:${mod.needsLoader}`,
      source: "it needs the loader",
    });
  return merged;
};

/**
 * The order dependencies ask for, changing as little as possible: a mod that
 * others depend on loads (and deploys) before them, so it loses the files
 * they share. Mods with no ordering facts keep their place relative to each
 * other. A cycle is reported and left in the current order.
 */
export const sortModsByDependencies = (
  mods: Pick<InstalledMod, "id" | "name" | "loader">[],
  infos: Map<string, ModDependencyInfo>
): ModOrderProposal => {
  const byProvided = new Map<string, string[]>();
  const provide = (key: string, modId: string) =>
    byProvided.set(key, [...(byProvided.get(key) ?? []), modId]);
  for (const mod of mods) {
    for (const key of infos.get(mod.id)?.provides ?? []) provide(key, mod.id);
    if (mod.loader) provide(`loader:${mod.loader.kind}`, mod.id);
  }

  const edges: OrderEdge[] = [];
  for (const mod of mods) {
    const info = infos.get(mod.id);
    if (!info) continue;
    for (const after of info.after)
      for (const first of byProvided.get(after.id) ?? [])
        if (first !== mod.id)
          edges.push({ first, then: mod.id, source: after.source });
    for (const before of info.before)
      for (const then of byProvided.get(before.id) ?? [])
        if (then !== mod.id)
          edges.push({ first: mod.id, then, source: before.source });
  }

  const index = new Map(mods.map((mod, position) => [mod.id, position]));
  const names = new Map(mods.map((mod) => [mod.id, mod.name]));
  const waitingOn = new Map(mods.map((mod) => [mod.id, new Set<string>()]));
  for (const edge of edges) waitingOn.get(edge.then)!.add(edge.first);

  const placed: string[] = [];
  const remaining = new Set(mods.map((mod) => mod.id));
  const cycles: string[][] = [];
  while (remaining.size > 0) {
    const ready = [...remaining].find((modId) =>
      [...waitingOn.get(modId)!].every((first) => !remaining.has(first))
    );
    let next = ready;
    if (!next) {
      // Everything left waits on something left: a cycle.
      const stuck = [...remaining].toSorted(
        (a, b) => index.get(a)! - index.get(b)!
      );
      cycles.push(
        stuck
          .filter((modId) =>
            [...waitingOn.get(modId)!].some((first) => remaining.has(first))
          )
          .map((modId) => names.get(modId)!)
      );
      next = stuck[0];
    }
    placed.push(next);
    remaining.delete(next);
  }

  const changes: ModOrderChange[] = edges
    .filter((edge) => index.get(edge.first)! > index.get(edge.then)!)
    .filter((edge) => placed.indexOf(edge.first) < placed.indexOf(edge.then))
    .map((edge) => ({
      modName: names.get(edge.first)!,
      beforeName: names.get(edge.then)!,
      reason: edge.source,
    }));

  return {
    order: placed,
    changes,
    cycles,
    unchanged: placed.every((modId, position) => mods[position].id === modId),
  };
};
