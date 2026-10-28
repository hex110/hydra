import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, describe, test } from "node:test";

import { JSDOM } from "jsdom";

const source = readFileSync(
  new URL("../extensions/steam/content.js", import.meta.url),
  "utf8"
);

const windows = [];
// A page's timers and observers would keep the test process alive.
after(() => windows.forEach((window) => window.close()));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs the add-on's content script on a page, with a stand-in for the
// background script that answers each lookup with `respond(message)`.
const open = async ({ url, html, respond = () => ({ state: "none" }) }) => {
  const { window } = new JSDOM(`<!doctype html><body>${html}</body>`, {
    url,
    runScripts: "outside-only",
  });
  windows.push(window);
  // jsdom doesn't lay anything out: only what a real page would hide is hidden.
  window.Element.prototype.getClientRects = function getClientRects() {
    return this.closest(".hidden") ? [] : [{}];
  };

  // Messages are made inside jsdom's realm; compare them as plain data.
  const sent = [];
  window.chrome = {
    i18n: {
      getMessage: (key, substitutions) =>
        substitutions ? `${key}:${substitutions.join("|")}` : key,
    },
    runtime: {
      sendMessage: async (message) => {
        sent.push(JSON.parse(JSON.stringify(message)));
        return respond(message);
      },
    },
  };
  window.eval(source);
  await wait(20);
  return { window, document: window.document, sent };
};

const box = (document) => document.getElementById("hydra-plus-box");
const links = (document) =>
  [...box(document).querySelectorAll("a")].map((link) => link.href);

describe("browser add-on content script", () => {
  test("Steam store: box beside Community Hub, state from the app id", async () => {
    const { document, sent } = await open({
      url: "https://store.steampowered.com/app/1245620/ELDEN_RING/",
      html: '<div class="apphub_OtherSiteInfo"><a>Community Hub</a></div>',
      respond: () => ({ state: "installed" }),
    });

    assert.equal(box(document).parentElement.className, "apphub_OtherSiteInfo");
    assert.equal(box(document).dataset.variant, "steam");
    assert.deepEqual(sent, [{ type: "lookup", appId: "1245620" }]);
    assert.deepEqual(links(document), [
      "hydraplus://download?shop=steam&objectId=1245620",
      "hydraplus://game?shop=steam&objectId=1245620",
    ]);
    assert.equal(box(document).querySelector("a").hidden, true);
  });

  test("SteamDB and ProtonDB: app id from the path, box under the title", async () => {
    for (const [url, title] of [
      ["https://steamdb.info/app/1245620/charts/", "<h1>Elden Ring</h1>"],
      [
        "https://www.protondb.com/app/1245620",
        '<span class="GameInfo__Title-sc-19o71ac-2 iCanPw">ELDEN RING</span>',
      ],
    ]) {
      const { document, sent } = await open({
        url,
        html: `${title}<p>next</p>`,
      });
      assert.equal(
        document.querySelector("p").previousElementSibling,
        box(document)
      );
      assert.equal(sent[0].appId, "1245620");
    }
  });

  test("Backloggd: skips the hidden mobile heading and looks up by title", async () => {
    const { document, sent } = await open({
      url: "https://backloggd.com/games/elden-ring/",
      html: `
        <div class="hidden"><div class="game-title-section"><h1>Elden Ring</h1></div></div>
        <div class="game-title-section"><h1 id="shown">Elden Ring</h1></div>
        <h1>4.5</h1>`,
      respond: () => ({
        state: "library",
        appId: "1245620",
        name: "ELDEN RING",
      }),
    });

    assert.equal(
      document.getElementById("shown").nextElementSibling,
      box(document)
    );
    assert.deepEqual(sent[0], {
      type: "lookup",
      title: "Elden Ring",
    });
    // Once the app names the Steam game, the links use its exact id.
    assert.deepEqual(links(document), [
      "hydraplus://download?shop=steam&objectId=1245620",
      "hydraplus://game?shop=steam&objectId=1245620",
    ]);
    assert.equal(
      box(document).querySelector(".hydra-plus-box__status").title,
      "statusWithName:ELDEN RING|state_library"
    );
  });

  test("a title site links by title while the app is not running", async () => {
    const { document } = await open({
      url: "https://www.metacritic.com/game/elden-ring/",
      html: "<h1>Elden Ring</h1>",
      respond: () => ({ state: "unknown" }),
    });
    assert.deepEqual(links(document), [
      "hydraplus://download?title=Elden%20Ring",
      "hydraplus://game?title=Elden%20Ring",
    ]);
  });

  test("hides the box when the app finds no Steam game", async () => {
    const { document } = await open({
      url: "https://opencritic.com/game/1234/some-console-exclusive",
      html: "<h1>Some Console Exclusive</h1>",
      respond: () => ({ state: "nomatch" }),
    });
    assert.equal(box(document).hidden, true);
  });

  test("PCGamingWiki: exact app from the infobox, title otherwise", async () => {
    const infobox = (steamdb) => `
      <h1>Elden Ring</h1>
      <div class="template-infobox-header"></div>
      <div class="infobox-steamdb">${steamdb}</div>`;

    const exact = await open({
      url: "https://www.pcgamingwiki.com/wiki/Elden_Ring",
      html: infobox('<a href="https://steamdb.info/app/1245620/">SteamDB</a>'),
    });
    assert.equal(exact.sent[0].appId, "1245620");

    const byTitle = await open({
      url: "https://www.pcgamingwiki.com/wiki/Elden_Ring",
      html: infobox(""),
    });
    assert.equal(byTitle.sent[0].title, "Elden Ring");

    const article = await open({
      url: "https://www.pcgamingwiki.com/wiki/Glossary",
      html: "<h1>Glossary</h1>",
    });
    assert.equal(box(article.document), null);
  });

  test("adds nothing on pages that are not a game's", async () => {
    for (const [url, html] of [
      ["https://backloggd.com/games/lib/popular/", "<h1>Popular</h1>"],
      ["https://www.metacritic.com/browse/game/", "<h1>Browse</h1>"],
      ["https://store.steampowered.com/app/", ""],
      ["https://example.com/game/1/x", "<h1>X</h1>"],
    ]) {
      const { document, sent } = await open({ url, html });
      assert.equal(box(document), null, url);
      assert.deepEqual(sent, [], url);
    }
  });

  test("follows a single-page app to the next game", async () => {
    const { window, document, sent } = await open({
      url: "https://opencritic.com/browse/all",
      html: "<h1>Browse</h1>",
    });
    assert.equal(box(document), null);

    window.history.pushState({}, "", "/game/12090/elden-ring");
    document.querySelector("h1").textContent = "Elden Ring";
    await wait(300);
    assert.equal(sent.at(-1).title, "Elden Ring");

    window.history.pushState({}, "", "/game/9999/hades-ii");
    document.querySelector("h1").textContent = "Hades II";
    await wait(300);
    assert.equal(sent.at(-1).title, "Hades II");
    assert.equal(document.querySelectorAll("#hydra-plus-box").length, 1);
  });

  test("floats in a corner when the page has no heading to sit under", async () => {
    const { document, sent } = await open({
      url: "https://howlongtobeat.com/game/68151",
      html: "",
    });
    document.head.innerHTML =
      '<meta property="og:title" content="How long is Elden Ring? | HowLongToBeat">';
    assert.equal(box(document), null);

    await wait(3700);
    assert.ok(box(document).classList.contains("hydra-plus-box--floating"));
    assert.equal(box(document).parentElement, document.body);
    assert.equal(sent.at(-1).title, "Elden Ring");
  });
});
