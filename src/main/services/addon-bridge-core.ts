export type AddonGameState = "none" | "library" | "installed";

export interface AddonRequest {
  method?: string;
  url?: string;
  host?: string;
  origin?: string;
}

export interface AddonResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const EXTENSION_ORIGIN = /^(moz|chrome)-extension:\/\/[\w-]+$/;
const STEAM_APP_ID = /^\d{1,10}$/;

const json = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): AddonResponse => ({
  status,
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});

/**
 * Answers the browser add-on's "is this game in my library?" question. Any web
 * page can reach 127.0.0.1, so a request must come from an extension origin (a
 * page cannot forge one) and carry our own host name (DNS rebinding).
 */
export const handleAddonRequest = async (
  request: AddonRequest,
  port: number,
  getGameState: (objectId: string) => Promise<AddonGameState>
): Promise<AddonResponse> => {
  const { origin } = request;
  if (!origin || !EXTENSION_ORIGIN.test(origin)) {
    return json(403, { error: "forbidden" });
  }
  if (
    request.host !== `127.0.0.1:${port}` &&
    request.host !== `localhost:${port}`
  ) {
    return json(403, { error: "forbidden" });
  }

  const cors = { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
  if (request.method !== "GET") return json(405, { error: "method" }, cors);

  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname !== "/game") return json(404, { error: "not found" }, cors);

  const shop = url.searchParams.get("shop") ?? "steam";
  const objectId = url.searchParams.get("objectId") ?? "";
  if (shop !== "steam" || !STEAM_APP_ID.test(objectId)) {
    return json(400, { error: "bad game" }, cors);
  }

  return json(200, { state: await getGameState(objectId) }, cors);
};
