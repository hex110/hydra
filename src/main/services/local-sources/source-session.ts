import { session, type Session } from "electron";
import { toBrowserUserAgent } from "./browser-user-agent";

const PARTITION = "persist:download-source-verification";

let sourceSession: Session | null = null;

/**
 * Holds the cookies a source host handed out when its challenge was passed,
 * apart from the app's own session. Source refreshes and the verification
 * window both use it, so a verified host stays fetchable.
 */
export const getSourceSession = () => {
  if (!sourceSession) {
    sourceSession = session.fromPartition(PARTITION);
    sourceSession.setUserAgent(
      toBrowserUserAgent(sourceSession.getUserAgent())
    );
    sourceSession.setPermissionRequestHandler((_contents, _permission, done) =>
      done(false)
    );
    sourceSession.setPermissionCheckHandler(() => false);
    sourceSession.on("will-download", (event) => event.preventDefault());
  }
  return sourceSession;
};
