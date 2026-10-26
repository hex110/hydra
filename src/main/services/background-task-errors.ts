import type { BackgroundTaskError } from "@types";

interface HttpLikeError {
  isAxiosError?: boolean;
  code?: string;
  message?: string;
  response?: { status?: number };
}

const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "ECONNABORTED",
  "ERR_NETWORK",
]);

/** Turns a thrown error into a reason the user can act on. */
export const describeTaskError = (error: unknown): BackgroundTaskError => {
  if (!error || typeof error !== "object") return "unknown";
  const { isAxiosError, code, message, response } = error as HttpLikeError;

  if (message?.endsWith("-not-configured")) return "not-configured";
  if (message === "steam-history-private-or-empty") return "private-profile";

  const status = response?.status;
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rate-limited";
  if (status !== undefined && status >= 500) return "server";

  if ((code && NETWORK_CODES.has(code)) || (isAxiosError && !response)) {
    return "unreachable";
  }
  return "unknown";
};
