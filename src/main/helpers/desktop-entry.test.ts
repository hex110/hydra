import { describe, it } from "node:test";
import assert from "node:assert";
import { desktopEntryFileName, renderDesktopEntry } from "./desktop-entry.ts";

describe("renderDesktopEntry", () => {
  it("quotes the command and points at the icon", () => {
    assert.strictEqual(
      renderDesktopEntry({
        name: "Castlevania: Belmont's Curse",
        command: [
          "/opt/Hydra Plus/hydra-plus",
          "hydraplus://run?shop=steam&objectId=4231820",
        ],
        iconPath: "/home/user/.config/hydra-plus/Assets/steam-4231820/icon.png",
      }),
      [
        "[Desktop Entry]",
        "Type=Application",
        "Name=Castlevania: Belmont's Curse",
        'Exec="/opt/Hydra Plus/hydra-plus" "hydraplus://run?shop=steam&objectId=4231820"',
        "Icon=/home/user/.config/hydra-plus/Assets/steam-4231820/icon.png",
        "Terminal=false",
        "Categories=Game;",
        "",
      ].join("\n")
    );
  });

  it("escapes reserved characters in arguments", () => {
    const entry = renderDesktopEntry({
      name: "Line\nBreak",
      command: ['/a "b"/$c', "100%"],
      iconPath: null,
    });

    assert.match(entry, /^Name=Line\\nBreak$/m);
    assert.match(entry, /^Exec="\/a \\\\"b\\\\"\/\\\\\$c" "100%%"$/m);
    assert.doesNotMatch(entry, /^Icon=/m);
  });
});

describe("desktopEntryFileName", () => {
  it("replaces characters that are unsafe in file names", () => {
    assert.strictEqual(
      desktopEntryFileName("hydraplus-game-", "custom", "a/b c"),
      "hydraplus-game-custom-a_b_c.desktop"
    );
  });
});
