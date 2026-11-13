const STEAM_ATTENTION_EVENT = "hydra:steam-attention";

/** Makes the header's Steam button pulse for a few seconds: something needs Steam open. */
export const requestSteamAttention = () =>
  window.dispatchEvent(new CustomEvent(STEAM_ATTENTION_EVENT));

export const onSteamAttention = (listener: () => void) => {
  window.addEventListener(STEAM_ATTENTION_EVENT, listener);
  return () => window.removeEventListener(STEAM_ATTENTION_EVENT, listener);
};
