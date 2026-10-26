export type CloudSaveAccessAction = "sign-in" | "paywall" | "open";

export const getCloudSaveAccessAction = (
  isAuthenticated: boolean,
  hasActiveSubscription: boolean,
  /** The user's own save store replaces Hydra Cloud. */
  hasSelfHostedStore = false
): CloudSaveAccessAction => {
  if (hasSelfHostedStore) return "open";
  if (!isAuthenticated) return "sign-in";
  if (!hasActiveSubscription) return "paywall";
  return "open";
};
