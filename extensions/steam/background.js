// Asks the running Hydra Plus about a game. The request has to come from here:
// a content script would send the store page's origin, and Hydra Plus only
// answers extensions.
const api = globalThis.browser ?? globalThis.chrome;
const BRIDGE_URL = "http://127.0.0.1:41907";

const getGameState = async (appId) => {
  try {
    const response = await fetch(
      `${BRIDGE_URL}/game?shop=steam&objectId=${encodeURIComponent(appId)}`
    );
    if (!response.ok) return "unknown";
    const { state } = await response.json();
    return state;
  } catch {
    // Hydra Plus is not running.
    return "unknown";
  }
};

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "gameState") return false;
  void getGameState(message.appId).then(sendResponse);
  return true;
});
