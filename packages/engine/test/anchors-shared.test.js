import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAnchors, supportedVersions, remapAnchors, nearestVersion } from '../src/anchors.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const anchorsDir = path.join(here, 'fixtures/anchors');
const repoAnchors = path.join(here, '../../../anchors');

describe('shared anchors', () => {
  it('falls back from anchors/<platform>/<ver>.json to the shared anchors/<ver>.json', async () => {
    const lin = await loadAnchors({ platform: 'linux', version: 'test-fixture', anchorsDir });
    assert.equal(lin.source, 'linux');
    const w = await loadAnchors({ platform: 'win32', version: 'test-shared', anchorsDir });
    assert.equal(w.source, 'shared');
    assert.equal(w.files[0].relative, 'resources/app/out/vs/workbench/workbench.desktop.main.js');
  });

  it('remaps resources/app → Resources/app for macOS (root = Cursor.app/Contents)', async () => {
    const m = await loadAnchors({ platform: 'darwin', version: 'test-pristine', anchorsDir });
    assert.equal(m.productJson, 'Resources/app/product.json');
    assert.equal(m.checksumBase, 'Resources/app/out');
    assert.equal(m.files[0].relative, 'Resources/app/out/vs/workbench/workbench.desktop.main.js');
    assert.deepEqual(Object.keys(m.pristine), ['Resources/app/out/vs/workbench/workbench.desktop.main.js']);
    assert.equal(remapAnchors(m, 'linux'), m);
  });

  it('honours the platforms list and lists versions per platform', async () => {
    assert.equal(await loadAnchors({ platform: 'darwin', version: 'test-linux-only', anchorsDir }), null);
    assert.deepEqual(await supportedVersions({ platform: 'darwin', anchorsDir }), ['test-pristine', 'test-shared']);
    assert.ok((await supportedVersions({ platform: 'linux', anchorsDir })).includes('test-fixture'));
    assert.ok((await supportedVersions({ platform: 'linux', anchorsDir })).includes('test-linux-only'));
  });

  it('picks the nearest adapted version for compat fallback (not always the newest)', () => {
    assert.equal(nearestVersion('3.24.18', ['3.27.14', '3.27.22', '3.28.7']), '3.27.14');
    assert.equal(nearestVersion('3.27.20', ['3.27.14', '3.27.22', '3.28.7']), '3.27.22');
    assert.equal(nearestVersion('3.29.0', ['3.27.14', '3.27.22', '3.28.7']), '3.28.7');
  });

  it('ships 3.27.22 and 3.28.7 as one shared file for linux, win32 and darwin', async () => {
    for (const version of ['3.27.22', '3.28.7']) {
      for (const platform of ['linux', 'win32', 'darwin']) {
        const a = await loadAnchors({ platform, version, anchorsDir: repoAnchors });
        assert.equal(a.source, 'shared', `${version}/${platform}`);
        assert.equal(a.dom.relatives.length, 2);
        assert.equal(Object.keys(a.pristine).length, 3);
        assert.ok(a.files[0].relative.startsWith(platform === 'darwin' ? 'Resources/app/' : 'resources/app/'));
      }
    }
  });
  // 智能体窗口（glass）原生菜单栏：菜单 title 字面量走片段；编辑菜单 3.27.x 为 keyed NLS 默认串，3.28.7 起并入 nls.messages 下标
  it('translates the Agents-window native menu bar items (3.27.14 / 3.27.22 / 3.28.7)', async () => {
    const titles = ['title:"新建智能体"', 'order:1,title:"更改"', 'order:2,title:"浏览器"', 'order:3,title:"文件"', 'order:4,title:"终端"', '"0_glassMacApp",order:0,title:"设置"'];
    const editFrags = ['"撤销(&&U)"', '"重做(&&R)"', '"剪切(&&T)"', '"复制(&&C)"', '"粘贴(&&P)"', '"全选(&&A)"'];
    const editNls = ['&&Undo', '&&Redo', 'Cu&&t', '&&Copy', '&&Paste', 'Select &&All'];
    for (const version of ['3.27.14', '3.27.22', '3.28.7']) {
      const a = await loadAnchors({ platform: 'darwin', version, anchorsDir: repoAnchors });
      const glass = a.files.find((f) => f.relative.endsWith('workbench.glass.main.js'));
      const to = glass.fragments.map((f) => f.to).join('\n');
      for (const t of titles) assert.ok(to.includes(t), `${version}: ${t}`);
      if (version === '3.28.7') {
        const from = new Set((a.nls?.entries ?? []).map((e) => e.from));
        for (const t of editNls) assert.ok(from.has(t), `${version} nls: ${t}`);
      } else {
        for (const t of editFrags) assert.ok(to.includes(t), `${version}: ${t}`);
      }
    }
  });
});
