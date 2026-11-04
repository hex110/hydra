import axios from "axios";

import { appVersion } from "@main/constants";
import {
  LOADER_SIGNS,
  MAX_LOADER_EVIDENCE_MODS,
  isSameTitle,
  type NexusLoaderEvidence,
} from "@shared";
import type {
  NexusFileCategory,
  NexusGameMatch,
  NexusModFile,
  NexusModRequirement,
  NexusModSearchResult,
  NexusModSort,
} from "@types";

/** Nexus's public API: games, mods and files need no API key. */
const GRAPHQL_URL = "https://api.nexusmods.com/v2/graphql";
const REQUEST_TIMEOUT_MS = 20_000;
export const NEXUS_PAGE_SIZE = 20;

const query = async <T>(
  text: string,
  variables: Record<string, unknown>
): Promise<T> => {
  const response = await axios.post<{
    data?: T;
    errors?: { message: string }[];
  }>(
    GRAPHQL_URL,
    { query: text, variables },
    {
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        "content-type": "application/json",
        "User-Agent": `HydraPlus/${appVersion}`,
      },
    }
  );
  if (response.data.errors?.length || !response.data.data) {
    throw new Error(
      response.data.errors?.map((error) => error.message).join("; ") ||
        "Nexus Mods returned no data"
    );
  }
  return response.data.data;
};

const GAMES_QUERY = `query Games($name: String!) {
  games(filter: { name: [{ value: $name, op: WILDCARD }] }, count: 10) {
    nodes { id domainName name }
  }
}`;

export const searchNexusGames = async (
  name: string
): Promise<NexusGameMatch[]> => {
  const data = await query<{ games: { nodes: NexusGameMatch[] } }>(
    GAMES_QUERY,
    { name }
  );
  return data.games.nodes;
};

const GAME_BY_DOMAIN_QUERY = `query Game($domain: String!) {
  game(domainName: $domain) { id domainName name }
}`;

export const findNexusGameByDomain = async (
  domain: string
): Promise<NexusGameMatch | null> => {
  const data = await query<{ game: NexusGameMatch | null }>(
    GAME_BY_DOMAIN_QUERY,
    { domain }
  );
  return data.game;
};

/** The Nexus game for a library title, when one matches it exactly. */
export const findNexusGame = async (
  title: string
): Promise<NexusGameMatch | null> => {
  const games = await searchNexusGames(title);
  return games.find((game) => isSameTitle(game.name, title)) ?? null;
};

const SORT_FIELDS: Record<NexusModSort, string> = {
  downloads: "downloads",
  endorsements: "endorsements",
  updated: "updatedAt",
};

const modsQuery = (sort: NexusModSort, withName: boolean) => `query Mods(
  $domain: String!, ${withName ? "$name: String!, " : ""}$offset: Int!, $count: Int!
) {
  mods(
    filter: {
      gameDomainName: [{ value: $domain, op: EQUALS }]
      ${withName ? "name: [{ value: $name, op: WILDCARD }]" : ""}
    }
    count: $count
    offset: $offset
    sort: [{ ${SORT_FIELDS[sort]}: { direction: DESC } }]
  ) {
    nodes {
      modId name summary version author pictureUrl downloads endorsements
      updatedAt adultContent
    }
    totalCount
  }
}`;

interface RawMod {
  modId: number;
  name: string;
  summary: string | null;
  version: string | null;
  author: string | null;
  pictureUrl: string | null;
  downloads: number | null;
  endorsements: number | null;
  updatedAt: string | null;
  adultContent: boolean | null;
}

export const searchNexusMods = async ({
  gameDomain,
  search,
  sort,
  offset,
}: {
  gameDomain: string;
  search: string;
  sort: NexusModSort;
  offset: number;
}): Promise<NexusModSearchResult> => {
  const name = search.trim();
  const data = await query<{
    mods: { nodes: RawMod[]; totalCount: number };
  }>(modsQuery(sort, name.length > 0), {
    domain: gameDomain,
    ...(name ? { name } : {}),
    offset,
    count: NEXUS_PAGE_SIZE,
  });
  return {
    totalCount: data.mods.totalCount,
    mods: data.mods.nodes.map((mod) => ({
      modId: mod.modId,
      name: mod.name,
      summary: mod.summary,
      version: mod.version,
      author: mod.author,
      pictureUrl: mod.pictureUrl,
      downloads: mod.downloads ?? 0,
      endorsements: mod.endorsements ?? 0,
      updatedAt: mod.updatedAt,
      adult: mod.adultContent === true,
    })),
  };
};

const FILES_QUERY = `query Files($modId: ID!, $gameId: ID!) {
  modFiles(modId: $modId, gameId: $gameId) {
    fileId name version category sizeInBytes date description
  }
}`;

export const getNexusModFiles = async (
  gameId: number,
  modId: number
): Promise<NexusModFile[]> => {
  const data = await query<{
    modFiles: {
      fileId: number;
      name: string;
      version: string | null;
      category: NexusFileCategory;
      sizeInBytes: string | null;
      date: number;
      description: string | null;
    }[];
  }>(FILES_QUERY, { modId, gameId });
  return data.modFiles.map((file) => ({
    fileId: file.fileId,
    name: file.name,
    version: file.version,
    category: file.category,
    sizeInBytes: file.sizeInBytes ? Number(file.sizeInBytes) : null,
    uploadedAt: file.date,
    description: file.description,
  }));
};

const REQUIREMENTS_QUERY = `query Requirements($modId: ID!, $gameId: ID!) {
  mod(modId: $modId, gameId: $gameId) {
    modRequirements {
      nexusRequirements {
        nodes { modId modName url externalRequirement notes gameId }
      }
    }
  }
}`;

/** The mods and tools a Nexus mod's page lists as required. */
export const getNexusModRequirements = async (
  gameId: number,
  modId: number
): Promise<NexusModRequirement[]> => {
  const data = await query<{
    mod: {
      modRequirements: {
        nexusRequirements: {
          nodes: {
            modId: string | null;
            modName: string | null;
            url: string | null;
            externalRequirement: boolean;
            notes: string | null;
            gameId: string | null;
          }[];
        };
      } | null;
    } | null;
  }>(REQUIREMENTS_QUERY, { modId, gameId });
  return (data.mod?.modRequirements?.nexusRequirements.nodes ?? []).flatMap(
    (node) => {
      const sameGame =
        !node.externalRequirement &&
        node.modId &&
        Number(node.gameId) === gameId;
      const name = node.modName?.trim() || node.url || "";
      if (!name) return [];
      return [
        {
          modId: sameGame ? Number(node.modId) : null,
          name,
          url: node.url || null,
          notes: node.notes?.trim() || null,
        },
      ];
    }
  );
};

const MOD_QUERY = `query Mod($modId: ID!, $gameId: ID!) {
  mod(modId: $modId, gameId: $gameId) { name version }
}`;

export const getNexusModName = async (gameId: number, modId: number) => {
  const data = await query<{
    mod: { name: string; version: string | null } | null;
  }>(MOD_QUERY, { modId, gameId });
  return data.mod?.name ?? null;
};

const FILE_CONTENTS_QUERY = `query FileContents($filter: ModFileContentSearchFilter!, $count: Int!, $offset: Int!) {
  modFileContents(filter: $filter, count: $count, offset: $offset) {
    totalCount
    nodes { modId fileId filePath fileSize }
  }
}`;

interface FileContentNode {
  modId: number;
  fileId: number;
  filePath: string;
  fileSize: string;
}

const FILE_CONTENTS_PAGE = 100;
/** A file list past this is cut off: plans need the layout, not every texture. */
const MAX_FILE_CONTENTS = 2_000;

/**
 * The files inside a Nexus file's archive, without downloading it: Nexus's
 * file contents index answers without a key.
 */
export const getNexusFileContents = async (
  gameId: number,
  fileId: number
): Promise<{ path: string; size: number }[] | null> => {
  const files: { path: string; size: number }[] = [];
  for (
    let offset = 0;
    offset < MAX_FILE_CONTENTS;
    offset += FILE_CONTENTS_PAGE
  ) {
    const data = await query<{
      modFileContents: { totalCount: number; nodes: FileContentNode[] };
    }>(FILE_CONTENTS_QUERY, {
      filter: {
        gameId: [{ value: gameId, op: "EQUALS" }],
        fileId: [{ value: fileId, op: "EQUALS" }],
      },
      count: FILE_CONTENTS_PAGE,
      offset,
    });
    const { totalCount, nodes } = data.modFileContents;
    files.push(
      ...nodes.map((node) => ({
        path: node.filePath,
        size: Number(node.fileSize),
      }))
    );
    if (offset + FILE_CONTENTS_PAGE >= totalCount || nodes.length === 0) {
      // Nexus has no index for some files (old uploads, non-archives).
      return totalCount === 0 ? null : files;
    }
  }
  return files;
};

/**
 * Distinct mods of a game whose files match a filter. One mod can fill a
 * whole page (a REFramework pack has thousands of files), so each round
 * leaves out the mods already found.
 */
const findModsWith = async (
  gameId: number,
  filter: Record<string, unknown>
) => {
  const found = new Set<number>();
  for (let round = 0; round < 6; round++) {
    const data = await query<{
      modFileContents: { totalCount: number; nodes: FileContentNode[] };
    }>(FILE_CONTENTS_QUERY, {
      filter: {
        gameId: [{ value: gameId, op: "EQUALS" }],
        ...filter,
        ...(found.size > 0
          ? {
              modId: [...found].map((modId) => ({
                value: modId,
                op: "NOT_EQUALS",
              })),
            }
          : {}),
      },
      count: FILE_CONTENTS_PAGE,
      offset: 0,
    });
    const { nodes } = data.modFileContents;
    if (nodes.length === 0) break;
    for (const node of nodes) found.add(node.modId);
    if (found.size >= MAX_LOADER_EVIDENCE_MODS) break;
  }
  return found;
};

/** How many of a game's Nexus mods ship each known loader's files. */
export const getNexusLoaderEvidence = async (
  gameId: number
): Promise<NexusLoaderEvidence> => {
  const counts = await Promise.all(
    LOADER_SIGNS.map(async (sign) => {
      const mods = new Set<number>();
      const lookups = [
        ...sign.fileNames.map((fileName) =>
          findModsWith(gameId, {
            fileNameWildcard: [{ value: fileName, op: "EQUALS" }],
          })
        ),
        ...(sign.folders ?? []).map((folder) =>
          findModsWith(gameId, {
            filePathPartsExact: [{ value: folder, op: "EQUALS" }],
          })
        ),
      ];
      for (const found of await Promise.all(lookups))
        for (const modId of found) mods.add(modId);
      return [sign.id, mods.size] as const;
    })
  );
  return {
    checkedAt: new Date().toISOString(),
    gameId,
    mods: Object.fromEntries(counts),
  };
};

const DESCRIPTION_QUERY = `query Description($modId: ID!, $gameId: ID!) {
  mod(modId: $modId, gameId: $gameId) { description }
}`;

/** A mod's full description from its Nexus page (BBCode and HTML). */
export const getNexusModDescription = async (gameId: number, modId: number) => {
  const data = await query<{ mod: { description: string | null } | null }>(
    DESCRIPTION_QUERY,
    { modId, gameId }
  );
  return data.mod?.description ?? null;
};
