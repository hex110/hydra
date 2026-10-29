/** Builds a minimal PE file with the given imports, for tests. */
export interface TestPeOptions {
  machine?: "x86" | "x64" | "arm64";
  imports?: string[];
  delayImports?: string[];
}

const MACHINE_CODES = { x86: 0x14c, x64: 0x8664, arm64: 0xaa64 };
const SECTION_RVA = 0x1000;
const SECTION_OFFSET = 0x400;
const PE_OFFSET = 0x80;

export const buildTestPe = ({
  machine = "x64",
  imports = [],
  delayImports = [],
}: TestPeOptions = {}) => {
  const plus = machine !== "x86";
  const optionalSize = plus ? 240 : 224;
  const directoriesOffset = PE_OFFSET + 24 + (plus ? 112 : 96);

  // One section holds both descriptor tables and every name.
  const importTable = (imports.length + 1) * 20;
  const delayTable = (delayImports.length + 1) * 32;
  const names = [...imports, ...delayImports];
  let nameCursor = importTable + delayTable;
  const nameRvas = names.map((name) => {
    const rva = SECTION_RVA + nameCursor;
    nameCursor += name.length + 1;
    return rva;
  });

  const section = Buffer.alloc(nameCursor);
  imports.forEach((_, index) => {
    section.writeUInt32LE(nameRvas[index], index * 20 + 12);
  });
  delayImports.forEach((_, index) => {
    section.writeUInt32LE(
      nameRvas[imports.length + index],
      importTable + index * 32 + 4
    );
  });
  names.forEach((name, index) => {
    section.write(name, nameRvas[index] - SECTION_RVA, "latin1");
  });

  const file = Buffer.alloc(SECTION_OFFSET + section.length);
  file.write("MZ", 0, "latin1");
  file.writeUInt32LE(PE_OFFSET, 0x3c);
  file.write("PE\0\0", PE_OFFSET, "latin1");
  file.writeUInt16LE(MACHINE_CODES[machine], PE_OFFSET + 4);
  file.writeUInt16LE(1, PE_OFFSET + 6);
  file.writeUInt16LE(optionalSize, PE_OFFSET + 20);
  file.writeUInt16LE(plus ? 0x20b : 0x10b, PE_OFFSET + 24);
  file.writeUInt32LE(16, directoriesOffset - 4);
  if (imports.length > 0)
    file.writeUInt32LE(SECTION_RVA, directoriesOffset + 8);
  if (delayImports.length > 0) {
    file.writeUInt32LE(SECTION_RVA + importTable, directoriesOffset + 13 * 8);
  }

  const sectionHeader = PE_OFFSET + 24 + optionalSize;
  file.write(".rdata", sectionHeader, "latin1");
  file.writeUInt32LE(section.length, sectionHeader + 8);
  file.writeUInt32LE(SECTION_RVA, sectionHeader + 12);
  file.writeUInt32LE(section.length, sectionHeader + 16);
  file.writeUInt32LE(SECTION_OFFSET, sectionHeader + 20);
  section.copy(file, SECTION_OFFSET);

  return file;
};
