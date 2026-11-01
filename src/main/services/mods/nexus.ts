import axios from "axios";

import { appVersion } from "@main/constants";
import { isSameTitle } from "@shared";
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
