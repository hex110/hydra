export interface InstallSpaceOptions {
  downloadBytes: number;
  extract: boolean;
  deleteArchive: boolean;
}

export interface InstallSpaceStep {
  /** Most disk the step uses at once, on top of what is there now. */
  peakBytes: number;
  /** What stays on disk once the step is done. */
  remainingBytes: number;
}

export interface InstallSpaceEstimate {
  download: InstallSpaceStep;
  extraction: InstallSpaceStep | null;
  installer: InstallSpaceStep | null;
}

/**
 * Hydra can't know the unpacked or installed size before downloading, so both
 * are taken to be as big as the download. Installer repacks often unpack to
 * more, which is why the numbers are shown as estimates.
 */
export const estimateInstallSpace = ({
  downloadBytes,
  extract,
  deleteArchive,
}: InstallSpaceOptions): InstallSpaceEstimate => {
  const unpackedBytes = downloadBytes;
  const installedBytes = downloadBytes;

  const download = { peakBytes: downloadBytes, remainingBytes: downloadBytes };
  if (!extract) return { download, extraction: null, installer: null };

  const archiveBytes = deleteArchive ? 0 : downloadBytes;
  const extraction = {
    peakBytes: downloadBytes + unpackedBytes,
    remainingBytes: archiveBytes + unpackedBytes,
  };
  const installer = {
    peakBytes: extraction.remainingBytes + installedBytes,
    remainingBytes: archiveBytes + installedBytes,
  };

  return { download, extraction, installer };
};
