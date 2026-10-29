import fs from "node:fs";

export type PeArchitecture = "x86" | "x64" | "arm64";

export interface PeInfo {
  /** Null for a machine type Hydra does not know. */
  architecture: PeArchitecture | null;
  /** Lower-case names of the DLLs the file imports at load time. */
  imports: string[];
  /** Lower-case names of the DLLs it imports on first use (delay-load). */
  delayImports: string[];
}

const MACHINES: Record<number, PeArchitecture> = {
  0x14c: "x86",
  0x8664: "x64",
  0xaa64: "arm64",
};

const PE32 = 0x10b;
const PE32_PLUS = 0x20b;
const IMPORT_DIRECTORY = 1;
const DELAY_IMPORT_DIRECTORY = 13;
const IMPORT_DESCRIPTOR_SIZE = 20;
const DELAY_DESCRIPTOR_SIZE = 32;
/** Headers and the section table fit well inside this. */
const HEADER_SIZE = 64 * 1024;
const MAX_DESCRIPTORS = 1024;
const MAX_NAME_LENGTH = 260;

interface Section {
  virtualAddress: number;
  virtualSize: number;
  rawOffset: number;
  rawSize: number;
}

const readAt = async (
  handle: fs.promises.FileHandle,
  offset: number,
  length: number
) => {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, offset);
  return buffer.subarray(0, bytesRead);
};

const toFileOffset = (sections: Section[], rva: number) => {
  for (const section of sections) {
    const size = Math.max(section.virtualSize, section.rawSize);
    if (rva >= section.virtualAddress && rva < section.virtualAddress + size) {
      return section.rawOffset + (rva - section.virtualAddress);
    }
  }
  return null;
};

const readName = async (
  handle: fs.promises.FileHandle,
  sections: Section[],
  rva: number
) => {
  const offset = toFileOffset(sections, rva);
  if (offset === null) return null;
  const bytes = await readAt(handle, offset, MAX_NAME_LENGTH);
  const end = bytes.indexOf(0);
  if (end <= 0) return null;
  return bytes.toString("latin1", 0, end).toLowerCase();
};

/** Collects the DLL names of one descriptor table; `nameField` is where each descriptor keeps the name's RVA. */
const readDescriptorNames = async (
  handle: fs.promises.FileHandle,
  sections: Section[],
  tableRva: number,
  descriptorSize: number,
  nameField: number
) => {
  const tableOffset = toFileOffset(sections, tableRva);
  if (tableOffset === null) return [];

  const names: string[] = [];
  for (let index = 0; index < MAX_DESCRIPTORS; index++) {
    const descriptor = await readAt(
      handle,
      tableOffset + index * descriptorSize,
      descriptorSize
    );
    if (descriptor.length < descriptorSize) break;
    if (descriptor.every((byte) => byte === 0)) break;

    const name = await readName(
      handle,
      sections,
      descriptor.readUInt32LE(nameField)
    );
    if (name) names.push(name);
  }
  return names;
};

/**
 * Reads a PE file's machine type and the DLLs it imports, without loading
 * more than the headers and the import tables. Null for anything that is not
 * a readable PE file.
 */
export const readPeFile = async (filePath: string): Promise<PeInfo | null> => {
  const handle = await fs.promises.open(filePath, "r");

  try {
    const header = await readAt(handle, 0, HEADER_SIZE);
    if (header.length < 0x40 || header.readUInt16LE(0) !== 0x5a4d) return null;

    const peOffset = header.readUInt32LE(0x3c);
    if (peOffset + 24 > header.length) return null;
    if (header.readUInt32LE(peOffset) !== 0x00004550) return null;

    const machine = header.readUInt16LE(peOffset + 4);
    const sectionCount = header.readUInt16LE(peOffset + 6);
    const optionalSize = header.readUInt16LE(peOffset + 20);
    const optionalOffset = peOffset + 24;
    if (optionalOffset + optionalSize > header.length) return null;

    const magic = header.readUInt16LE(optionalOffset);
    const directoriesOffset =
      optionalOffset + (magic === PE32_PLUS ? 112 : magic === PE32 ? 96 : -1);
    if (directoriesOffset < optionalOffset) return null;

    const directoryCount = header.readUInt32LE(directoriesOffset - 4);
    const directory = (index: number) =>
      index < directoryCount &&
      directoriesOffset + index * 8 + 8 <= optionalOffset + optionalSize
        ? header.readUInt32LE(directoriesOffset + index * 8)
        : 0;

    const sections: Section[] = [];
    const sectionsOffset = optionalOffset + optionalSize;
    for (let index = 0; index < sectionCount; index++) {
      const at = sectionsOffset + index * 40;
      if (at + 40 > header.length) break;
      sections.push({
        virtualSize: header.readUInt32LE(at + 8),
        virtualAddress: header.readUInt32LE(at + 12),
        rawSize: header.readUInt32LE(at + 16),
        rawOffset: header.readUInt32LE(at + 20),
      });
    }

    const importRva = directory(IMPORT_DIRECTORY);
    const delayRva = directory(DELAY_IMPORT_DIRECTORY);

    return {
      architecture: MACHINES[machine] ?? null,
      imports: importRva
        ? await readDescriptorNames(
            handle,
            sections,
            importRva,
            IMPORT_DESCRIPTOR_SIZE,
            12
          )
        : [],
      delayImports: delayRva
        ? await readDescriptorNames(
            handle,
            sections,
            delayRva,
            DELAY_DESCRIPTOR_SIZE,
            4
          )
        : [],
    };
  } finally {
    await handle.close();
  }
};
