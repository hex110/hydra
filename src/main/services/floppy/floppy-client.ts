import axios, { type AxiosInstance } from "axios";

import type {
  FloppyEntry,
  FloppySearchResult,
  FloppyTrackedState,
} from "./floppy-sync-core";

export interface FloppyConfig {
  url: string;
  token: string;
}

interface FloppyConsumption {
  status: number | null;
  progress: number | null;
  score?: number | null;
  start_date?: string | null;
  end_date?: string | null;
}

interface FloppyListedItem {
  item?: { media_id?: string | number; title?: string };
  media_id?: string | number;
  title?: string;
  status?: number | null;
  score?: number | null;
  progress?: number | null;
}

interface FloppyPage<T> {
  results: T[];
  pagination?: { next?: string | null };
}

interface FloppyWriteBody {
  status?: number;
  progress?: number;
  score?: number | null;
  start_date?: string;
  end_date?: string;
}

const PAGE_SIZE = 200;
export const FLOPPY_WISHLIST_NAME = "Wishlist";

const createInstance = ({ url, token }: FloppyConfig) =>
  axios.create({
    baseURL: `${url.replace(/\/+$/, "")}/api/v1`,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15_000,
  });

export class FloppyClient {
  private readonly http: AxiosInstance;

  constructor(config: FloppyConfig) {
    this.http = createInstance(config);
  }

  async testConnection() {
    await this.http.get("/user/preferences/");
  }

  async searchGame(title: string) {
    const { data } = await this.http.get<{ results: FloppySearchResult[] }>(
      "/search/game/",
      { params: { search: title, source: "igdb", limit: 20 } }
    );
    return data.results ?? [];
  }

  async getState(mediaId: string): Promise<FloppyTrackedState> {
    const { data } = await this.http.get<{
      tracked: boolean;
      consumptions: FloppyConsumption[] | null;
    }>(`/media/game/igdb/${mediaId}/`);

    const latest = data.consumptions?.[0];
    return {
      tracked: Boolean(data.tracked && latest),
      status: latest?.status ?? null,
      progress: latest?.progress ?? 0,
      score: latest?.score ?? null,
      startDate: latest?.start_date ?? null,
      endDate: latest?.end_date ?? null,
    };
  }

  async track(mediaId: string, body: FloppyWriteBody & { status: number }) {
    await this.http.post("/media/game/", {
      source: "igdb",
      media_id: mediaId,
      ...body,
    });
  }

  async update(mediaId: string, body: FloppyWriteBody) {
    await this.http.patch(`/media/game/igdb/${mediaId}/`, body);
  }

  private async *pages<T>(path: string, params: Record<string, unknown> = {}) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data } = await this.http.get<FloppyPage<T>>(path, {
        params: { ...params, limit: PAGE_SIZE, offset },
      });
      yield* data.results;
      if (!data.pagination?.next) return;
    }
  }

  async listGames(): Promise<FloppyEntry[]> {
    const entries: FloppyEntry[] = [];

    for await (const row of this.pages<FloppyListedItem>("/media/game/")) {
      const mediaId = row.item?.media_id ?? row.media_id;
      if (mediaId === undefined) continue;

      entries.push({
        mediaId: String(mediaId),
        title: row.item?.title ?? row.title ?? "",
        status: row.status ?? null,
        score: row.score ?? null,
        progress: row.progress ?? 0,
      });
    }

    return entries;
  }

  /** The id of the Wishlist list, created on demand when `create` is set. */
  async getWishlistId(create: boolean) {
    const { data } = await this.http.get<{
      results: { id: number; name: string }[];
    }>("/lists/", { params: { limit: PAGE_SIZE } });

    const existing = data.results.find(
      (list) => list.name === FLOPPY_WISHLIST_NAME
    );
    if (existing) return existing.id;
    if (!create) return null;

    const created = await this.http.post<{ id: number }>("/lists/", {
      name: FLOPPY_WISHLIST_NAME,
    });
    return created.data.id;
  }

  async listWishlistMediaIds(listId: number) {
    const ids = new Set<string>();

    for await (const row of this.pages<FloppyListedItem>(
      `/lists/${listId}/items/`
    )) {
      const mediaId = row.item?.media_id ?? row.media_id;
      if (mediaId !== undefined) ids.add(String(mediaId));
    }

    return ids;
  }

  async setWishlisted(mediaId: string, listId: number, wishlisted: boolean) {
    const path = `/media/game/igdb/${mediaId}/lists/${listId}/`;
    if (wishlisted) await this.http.put(path, {});
    else await this.http.delete(path);
  }
}
