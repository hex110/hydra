import { describe, it } from "node:test";
import assert from "node:assert";
import { applyIniOverrides, parseIniOverrides } from "./ini-overrides.js";

describe("parseIniOverrides", () => {
  it("reads sections and keys and reports invalid lines", () => {
    const parsed = parseIniOverrides(
      "; menu key\n[Menu]\nShortcutKey = 0x78\n\nnot valid\n[Spoofing]\nDxgi=false"
    );
    assert.deepStrictEqual(parsed.overrides, [
      { section: "Menu", key: "ShortcutKey", value: "0x78" },
      { section: "Spoofing", key: "Dxgi", value: "false" },
    ]);
    assert.deepStrictEqual(parsed.invalidLines, [5]);
  });

  it("rejects keys outside a section", () => {
    assert.deepStrictEqual(parseIniOverrides("Dxgi=false").invalidLines, [1]);
  });
});

describe("applyIniOverrides", () => {
  const document = [
    "[Menu]",
    "; Shortcut",
    "ShortcutKey=auto",
    "Scale=auto",
    "",
    "[Plugins]",
    "Path=auto",
    "",
  ].join("\r\n");

  it("replaces existing keys and keeps comments and line endings", () => {
    const result = applyIniOverrides(document, [
      { section: "menu", key: "shortcutkey", value: "0x78" },
    ]);
    assert.ok(result.includes("; Shortcut\r\nshortcutkey=0x78\r\nScale=auto"));
  });

  it("adds missing keys at the end of their section", () => {
    const result = applyIniOverrides(document, [
      { section: "Plugins", key: "LoadAsiPlugins", value: "true" },
    ]);
    assert.ok(result.includes("Path=auto\r\nLoadAsiPlugins=true\r\n"));
  });

  it("adds missing sections at the end", () => {
    const result = applyIniOverrides("[Menu]\nScale=auto\n", [
      { section: "Log", key: "LogLevel", value: "0" },
    ]);
    assert.strictEqual(result, "[Menu]\nScale=auto\n\n[Log]\nLogLevel=0");
  });
});
