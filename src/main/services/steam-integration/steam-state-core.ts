/** Process id from Steam's pid file ("1234") or its Windows registry value ("0x4d2"). */
export const parseSteamPid = (content: string | null | undefined) => {
  const text = content?.trim();
  if (!text) return null;

  const pid = /^0x[0-9a-f]+$/i.test(text)
    ? Number.parseInt(text, 16)
    : Number(text);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
};

/** Whether a process name (`/proc/<pid>/comm`, an image name) is Steam's client. */
export const isSteamProcessName = (name: string | null | undefined) =>
  /^steam(\.exe)?$/i.test(name?.trim() ?? "");

export interface SteamStateInput {
  /** Contents of the first pid file that exists, or the registry value. */
  pidFile: string | null;
  /** Name of the process with that pid, null when no such process exists. */
  processName: string | null;
  /** Names are unavailable (Windows, macOS): a live process is enough. */
  trustLiveProcess?: boolean;
}

export const isSteamRunning = ({
  pidFile,
  processName,
  trustLiveProcess = false,
}: SteamStateInput) => {
  if (parseSteamPid(pidFile) === null || processName === null) return false;
  return trustLiveProcess || isSteamProcessName(processName);
};
