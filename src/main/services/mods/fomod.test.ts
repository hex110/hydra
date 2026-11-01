import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import {
  defaultFomodStepSelection,
  fomodPluginKey,
  getFomodPluginState,
  isFomodStepVisible,
  resolveFomodFiles,
  toggleFomodPlugin,
} from "../../../shared/fomod.ts";
import {
  applyFomod,
  decodeXml,
  findFomodRoot,
  parseModuleConfig,
} from "./fomod.ts";

const XML = `<?xml version="1.0" encoding="UTF-16"?>
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <moduleName>Better Textures</moduleName>
  <requiredInstallFiles>
    <folder source="Core" destination="" />
  </requiredInstallFiles>
  <installSteps order="Explicit">
    <installStep name="Resolution">
      <optionalFileGroups order="Explicit">
        <group name="Size" type="SelectExactlyOne">
          <plugins order="Explicit">
            <plugin name="2K">
              <description>Balanced.</description>
              <image path="fomod\\images\\2k.png" />
              <files><folder source="Options\\2K" destination="textures" /></files>
              <conditionFlags><flag name="size">2k</flag></conditionFlags>
              <typeDescriptor><type name="Recommended" /></typeDescriptor>
            </plugin>
            <plugin name="4K">
              <description>Sharp.</description>
              <files><folder source="Options\\4K" destination="textures" /></files>
              <conditionFlags><flag name="size">4k</flag></conditionFlags>
              <typeDescriptor><type name="Optional" /></typeDescriptor>
            </plugin>
          </plugins>
        </group>
        <group name="Extras" type="SelectAny">
          <plugins>
            <plugin name="Zeta">
              <description />
              <files><file source="extras\\zeta.esp" destination="" /></files>
              <typeDescriptor><type name="Optional" /></typeDescriptor>
            </plugin>
            <plugin name="Alpha">
              <description />
              <files><file source="extras\\alpha.esp" destination="alpha.esp" /></files>
              <typeDescriptor>
                <dependencyType>
                  <defaultType name="Optional" />
                  <patterns>
                    <pattern>
                      <dependencies operator="And"><flagDependency flag="size" value="4k" /></dependencies>
                      <type name="NotUsable" />
                    </pattern>
                  </patterns>
                </dependencyType>
              </typeDescriptor>
            </plugin>
          </plugins>
        </group>
      </optionalFileGroups>
    </installStep>
    <installStep name="4K only">
      <visible><flagDependency flag="size" value="4k" /></visible>
      <optionalFileGroups>
        <group name="Parallax" type="SelectAll">
          <plugins><plugin name="Parallax"><description /><files><file source="extras\\parallax.dds" destination="textures\\parallax.dds" /></files><typeDescriptor><type name="Optional" /></typeDescriptor></plugin></plugins>
        </group>
      </optionalFileGroups>
    </installStep>
  </installSteps>
  <conditionalFileInstalls>
    <patterns>
      <pattern>
        <dependencies operator="Or"><flagDependency flag="size" value="4k" /></dependencies>
        <files><file source="patch\\4k.ini" destination="4k.ini" priority="2" /></files>
      </pattern>
    </patterns>
  </conditionalFileInstalls>
</config>`;

const root = fs.mkdtempSync(path.join(os.tmpdir(), "fomod-"));
after(() => fs.rmSync(root, { recursive: true, force: true }));

describe("FOMOD", () => {
  const utf16 = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(XML, "utf16le"),
  ]);
  const config = parseModuleConfig(decodeXml(utf16));

  it("parses a UTF-16 ModuleConfig, sorting lists that aren't explicit", () => {
    assert.equal(config.moduleName, "Better Textures");
    assert.deepEqual(
      config.steps.map((step) => step.name),
      ["Resolution", "4K only"]
    );
    assert.deepEqual(
      config.steps[0].groups[1].plugins.map((plugin) => plugin.name),
      ["Alpha", "Zeta"]
    );
    assert.equal(
      config.steps[0].groups[0].plugins[0].image,
      "fomod/images/2k.png"
    );
    assert.deepEqual(config.requiredFiles, [
      { source: "Core", destination: "", isFolder: true, priority: 0 },
    ]);
    assert.equal(
      config.steps[0].groups[1].plugins[1].files[0].destination,
      "zeta.esp"
    );
  });

  it("finds the folder holding fomod/", () => {
    assert.equal(findFomodRoot(["Wrapper/fomod/ModuleConfig.xml"]), "Wrapper");
    assert.equal(findFomodRoot(["FOMOD/moduleconfig.xml"]), "");
    assert.equal(findFomodRoot(["readme.txt"]), null);
  });

  it("evaluates defaults, flags, visibility and plugin types", () => {
    let selected = defaultFomodStepSelection(config, 0, new Set());
    assert.ok(selected.has(fomodPluginKey(0, 0, 0)));
    assert.equal(isFomodStepVisible(config, 1, selected), false);
    assert.equal(
      getFomodPluginState(config, 0, 1, 0, selected).type,
      "Optional"
    );

    selected = toggleFomodPlugin(config, 0, 0, 1, selected);
    assert.ok(!selected.has(fomodPluginKey(0, 0, 0)));
    assert.ok(selected.has(fomodPluginKey(0, 0, 1)));
    assert.equal(isFomodStepVisible(config, 1, selected), true);
    assert.deepEqual(getFomodPluginState(config, 0, 1, 0, selected), {
      type: "NotUsable",
      locked: true,
    });

    selected = defaultFomodStepSelection(config, 1, selected);
    assert.ok(selected.has(fomodPluginKey(1, 0, 0)));
    assert.equal(getFomodPluginState(config, 1, 0, 0, selected).locked, true);

    assert.deepEqual(
      resolveFomodFiles(config, selected).map((file) => file.source),
      ["Core", "Options/4K", "extras/parallax.dds", "patch/4k.ini"]
    );
  });

  it("copies the chosen files into the staging folder, matching case", async () => {
    const source = path.join(root, "extract");
    for (const file of [
      "core/readme.txt",
      "Options/2K/rock.dds",
      "extras/Zeta.esp",
    ]) {
      fs.mkdirSync(path.dirname(path.join(source, file)), { recursive: true });
      fs.writeFileSync(path.join(source, file), file);
    }
    let selected = defaultFomodStepSelection(config, 0, new Set());
    selected = toggleFomodPlugin(config, 0, 1, 1, selected);
    const out = path.join(root, "out");
    const missing = await applyFomod(source, config, selected, out);
    assert.deepEqual(missing, []);
    assert.ok(fs.existsSync(path.join(out, "readme.txt")));
    assert.ok(fs.existsSync(path.join(out, "textures", "rock.dds")));
    assert.ok(fs.existsSync(path.join(out, "zeta.esp")));
  });
});
