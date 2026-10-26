import axios, { type AxiosInstance } from "axios";

import type {
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
}

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
    };
  }

  async track(mediaId: string, body: { status: number; progress?: number }) {
    await this.http.post("/media/game/", {
      source: "igdb",
      media_id: mediaId,
      ...body,
    });
  }

  async update(mediaId: string, body: { status?: number; progress?: number }) {
    await this.http.patch(`/media/game/igdb/${mediaId}/`, body);
  }
}
