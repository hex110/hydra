export type LocalSourceState = "ready" | "failed";

/** How Hydra's own copy of a download source is doing. */
export interface LocalSourceStatus {
  sourceId: string;
  state: LocalSourceState;
  entries: number;
  /** When the copy was last downloaded successfully. */
  fetchedAt: string | null;
  /** Why the last download failed, when it did. */
  error: string | null;
  /** The host serves a browser challenge that can be passed in a window. */
  needsVerification?: boolean;
}
