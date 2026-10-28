// Asks the running Hydra Plus about a game. The request has to come from here:
// a content script would send the page's origin, and Hydra Plus only answers
// extensions.
const api = globalThis.browser ?? globalThis.chrome;
const BRIDGE_URL = "http://127.0.0.1:41907";

const UNKNOWN = { state: "unknown" };

// Steam pages and SteamDB give the app id; other sites give only a title, which
// the app matches to a Steam game.
const lookup = async ({ appId, title }) => {
  try {
    if (appId) {
      const response = await fetch(
        `${BRIDGE_URL}/game?shop=steam&objectId=${encodeURIComponent(appId)}`
      );
      if (!response.ok) return UNKNOWN;
      const { state } = await response.json();
      return { state, appId };
    }

    const response = await fetch(
      `${BRIDGE_URL}/resolve?title=${encodeURIComponent(title)}`
    );
    const body = await response.json();
    // An older Hydra Plus answers "not found" to a route it doesn't have.
    if (body.error === "no match") return { state: "nomatch" };
    if (!response.ok) return UNKNOWN;
    return { state: body.state, appId: body.objectId, name: body.name };
  } catch {
    // Hydra Plus is not running.
    return UNKNOWN;
  }
};

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "lookup") return false;
  void lookup(message).then(sendResponse);
  return true;
});
