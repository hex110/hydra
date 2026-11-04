// usage: node scripts/dev/mod-hints/build-corpus.mjs <gameDomain>... [--top N]
//
// Fetches each game's most downloaded Nexus mods (description, newest main
// file and that file's contents list) into ~/.cache/hydra-mod-corpus, for
// scoring Hydra's install-hint reader. Nothing is written into the repo: the
// descriptions are the mod authors' text.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const topIndex = args.indexOf("--top");
const top = topIndex >= 0 ? Number(args[topIndex + 1]) : 25;
const domains = args.filter(
  (arg, index) => arg !== "--top" && index !== topIndex + 1
);
const root = path.join(os.homedir(), ".cache", "hydra-mod-corpus");

const query = async (text, variables) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch("https://api.nexusmods.com/v2/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "User-Agent": "HydraPlus-corpus",
      },
      body: JSON.stringify({ query: text, variables }),
    });
    const body = await response.json().catch(() => null);
    if (body?.data) return body.data;
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  throw new Error("Nexus did not answer");
};

for (const domain of domains) {
  const { game } = await query(
    `query($d:String!){ game(domainName:$d){ id name } }`,
    { d: domain }
  );
  const { mods } = await query(
    `query($d:String!,$n:Int!){ mods(filter:{gameDomainName:{value:$d}, adultContent:{value:false}}, sort:{downloads:{direction:DESC}}, count:$n){ nodes{ modId name } } }`,
    { d: domain, n: top }
  );
  const folder = path.join(root, domain);
  fs.mkdirSync(folder, { recursive: true });
  for (const mod of mods.nodes) {
    const file = path.join(folder, `${mod.modId}.json`);
    if (fs.existsSync(file)) continue;
    const [{ mod: detail }, { modFiles }] = await Promise.all([
      query(`query($m:ID!,$g:ID!){ mod(modId:$m, gameId:$g){ description } }`, {
        m: mod.modId,
        g: game.id,
      }),
      query(
        `query($m:ID!,$g:ID!){ modFiles(modId:$m, gameId:$g){ fileId name category date } }`,
        { m: mod.modId, g: game.id }
      ),
    ]);
    const main = modFiles
      .filter((item) => item.category === "MAIN")
      .sort((a, b) => b.date - a.date)[0];
    let contents = [];
    if (main) {
      const data = await query(
        `query($f: ModFileContentSearchFilter!){ modFileContents(filter:$f, count:500){ nodes{ filePath } } }`,
        {
          f: {
            gameId: [{ value: game.id, op: "EQUALS" }],
            fileId: [{ value: main.fileId, op: "EQUALS" }],
          },
        }
      );
      contents = data.modFileContents.nodes.map((node) => node.filePath);
    }
    fs.writeFileSync(
      file,
      JSON.stringify({
        game: { domain, id: game.id, name: game.name },
        mod: { modId: mod.modId, name: mod.name },
        file: main ? { fileId: main.fileId, name: main.name } : null,
        contents,
        description: detail?.description ?? "",
      })
    );
    process.stdout.write(".");
  }
  console.log(` ${domain}: ${mods.nodes.length} mods`);
}
