// 打包界面：先把运行需要的文件按仓库原结构装配�?.build/app�?// 这样 main.js 里的相对引用 ../../packages/engine 和引擎里�?REPO 路径都不用改�?// 用法：node scripts/build-desktop.mjs [--appimage|--deb]      Linux（默�?AppImage + deb�?//       node scripts/build-desktop.mjs --win                    Windows x64：NSIS 安装�?+ zip + 便携�?exe（在 Linux 上交叉打包，未签名）
//       node scripts/build-desktop.mjs --mac                    macOS x64/arm64：zip（在 Linux 上交叉打包，未签名、未公证�?// 产物：dist/
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.join(repo, '.build/app');
const desktop = path.join(repo, 'apps/desktop');
const rd = (p) => fs.readFile(path.join(repo, p), 'utf8').then(JSON.parse);
const desktopPkg = await rd('apps/desktop/package.json');
const electronVersion = (await rd('node_modules/electron/package.json')).version;

await fs.rm(stage, { recursive: true, force: true });
const copy = (rel) => fs.cp(path.join(repo, rel), path.join(stage, rel), { recursive: true });
for (const f of ['main.js', 'preload.cjs', 'index.html', 'renderer.js', 'brand-icon.png', 'build/icon.png', 'build/icon.ico']) await copy(`apps/desktop/${f}`);
for (const d of ['packages/engine/src', 'packages/engine/helper', 'packages/engine/package.json', 'packages/dom-runtime', 'anchors', 'dicts']) await copy(d);
// 离线语言包：放进 vendor/，引擎优先用它（用前拷到缓存目录，外部的 Cursor 命令行读不到 asar 内路径）
const vsixName = 'ms-ceintl.vscode-language-pack-zh-hans-1.128.0.vsix';
const vsix = [process.env.CZL_VSIX, path.join(repo, 'vendor', vsixName), path.join(process.env.HOME || '', '.config/cursor-zh-localizer/cache', vsixName)]
  .filter(Boolean).find((p) => { try { return statSync(p).isFile(); } catch { return false; } });
if (vsix) { await fs.mkdir(path.join(stage, 'vendor'), { recursive: true }); await fs.copyFile(vsix, path.join(stage, 'vendor', vsixName)); console.log(`· 随附语言�?${vsix}`); }
else console.log('· 未找到语言�?vsix，运行时会联网从 open-vsx 下载');
// 原始文件哈希（核对用），放进 resources/pristine
const pristineDir = path.join(stage, 'pristine');
await fs.mkdir(pristineDir, { recursive: true });
for (const f of await fs.readdir(path.join(repo, 'docs'))) if (/^pristine-.*\.sha256$/.test(f)) await fs.copyFile(path.join(repo, 'docs', f), path.join(pristineDir, f));

await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify({
  // name / productName / appId / 安装目录保留旧名 cursor-zh-localizer：已装的 Electron 备用版靠它们覆盖升级与卸载；只有产物文件名改�?cursor-zh-electron-*
  name: 'cursor-zh-localizer',
  productName: 'cursor-zh-localizer',
  desktopName: 'cursor-zh-localizer.desktop',
  version: desktopPkg.version,
  description: 'YXY · Cursor 一键汉化：�?Cursor 界面翻译成简体中文，可一键还�?,
  author: { name: 'YXY', email: 'yxy@local' },
  homepage: 'https://github.com/mym20060307-a11y/cursor-zh-YXY',
  license: 'MIT',
  type: 'module',
  main: 'apps/desktop/main.js',
}, null, 2));

const config = {
  appId: 'local.cursor-zh-localizer',
  // 安装目录 /opt/cursor-zh-localizer 不带空格/中文；菜单里显示的名字由 desktop.entry.Name 决定
  productName: 'cursor-zh-localizer',
  electronVersion,
  directories: { app: stage, output: path.join(repo, 'dist'), buildResources: path.join(desktop, 'build') },
  files: ['**/*'],
  asar: true,
  // 写入助手要能�?deb 的安装脚本拷走，所以不放进 asar
  asarUnpack: ['packages/engine/helper/**'],
  extraResources: [{ from: path.join(desktop, 'build/linux/local.cursor-zh-localizer.apply.policy'), to: 'polkit/local.cursor-zh-localizer.apply.policy' }],
  linux: {
    executableName: 'cursor-zh-localizer',
    artifactName: 'cursor-zh-electron-${version}-${arch}.${ext}',
    category: 'Utility',
    icon: path.join(desktop, 'build/icon.png'),
    syncDesktopName: true,
    synopsis: 'Cursor 一键汉�?,
    target: [{ target: 'AppImage', arch: ['x64'] }, { target: 'deb', arch: ['x64'] }],
    desktop: { entry: { Name: 'Cursor 一键汉�?, Comment: '�?Cursor 界面翻译成简体中�? } },
  },
  deb: {
    depends: ['libgtk-3-0 | libgtk-3-0t64', 'libnotify4', 'libnss3', 'libxss1', 'libxtst6', 'xdg-utils', 'libatspi2.0-0 | libatspi2.0-0t64', 'libuuid1', 'libsecret-1-0'],
    recommends: ['pkexec | policykit-1'],
    afterInstall: path.join(desktop, 'build/linux/after-install.sh'),
    afterRemove: path.join(desktop, 'build/linux/after-remove.sh'),
  },
  win: {
    executableName: 'cursor-zh-localizer',
    artifactName: 'cursor-zh-electron-${version}-win-${arch}.${ext}',
    // 本工具自己不提权：需要写 Program Files 时由引擎按需�?UAC（czl-apply.ps1�?    requestedExecutionLevel: 'asInvoker',
    icon: path.join(desktop, 'build/icon.ico'),
    // 不签名，但仍�?resedit（纯 JS，不需�?wine）把图标和版本信息写�?exe
    signExecutable: false,
    // 安装包不�?electron-builder �?nsis 目标（Linux 上要 wine 生成卸载程序），见下�?makensis 那段
    target: [{ target: 'zip', arch: ['x64'] }, { target: 'portable', arch: ['x64'] }],
  },
  portable: { artifactName: 'cursor-zh-electron-${version}-win-${arch}-portable.${ext}' },
  mac: {
    artifactName: 'cursor-zh-electron-${version}-mac-${arch}.${ext}',
    category: 'public.app-category.utilities',
    icon: path.join(desktop, 'build/icon.icns'),
    identity: null,
    target: [{ target: 'zip', arch: ['x64', 'arm64'] }],
  },
};
const cfgPath = path.join(repo, '.build/electron-builder.json');
await fs.writeFile(cfgPath, JSON.stringify(config, null, 2));

const has = (f) => process.argv.includes(f);
const targetArgs = has('--win') ? ['--win', 'zip', 'portable', '--x64']
  : has('--mac') ? ['--mac', 'zip', '--x64', '--arm64']
  : ['--linux', ...(has('--appimage') ? ['AppImage'] : has('--deb') ? ['deb'] : ['AppImage', 'deb']), '--x64'];
const ebBin = process.platform === 'win32'
  ? path.join(repo, 'node_modules/electron-builder/cli.js')
  : path.join(repo, 'node_modules/.bin/electron-builder');
const ebArgs = [...targetArgs, '--config', cfgPath, '--projectDir', stage, '--publish', 'never'];
execFileSync(process.platform === 'win32' ? process.execPath : ebBin, process.platform === 'win32' ? [ebBin, ...ebArgs] : ebArgs, { stdio: 'inherit', cwd: repo });

// Linux �?electron-builder 不签 mac 包：改过 Info.plist/改了名的 .app 封印是坏的，从网上下载后会被提示“已损坏”�?// �?rcodesign（apple-codesign）时做一次整�?ad-hoc 签名并重新打 zip（保留符号链接）。仍未公证，首次打开需右键→打开�?if (has('--mac')) {
  const works = (p, a) => { try { execFileSync(p, a, { stdio: 'ignore' }); return true; } catch { return false; } };
  const find = (env, names, a) => [process.env[env], ...names].filter(Boolean).find((p) => works(p, a));
  const rcodesign = find('RCODESIGN', ['rcodesign', path.join(repo, '../tools/rcodesign')], ['--version']);
  const zipTool = find('ZIP', ['zip'], ['-v']) ? 'zip' : find('SEVENZIP', ['7zz', path.join(repo, '../tools/7zz')], ['i']);
  if (!rcodesign || !zipTool) console.log('· 未找�?rcodesign �?zip/7zz，mac 包保�?electron-builder 原样（未签名�?);
  else for (const [dir, arch] of [['mac', 'x64'], ['mac-arm64', 'arm64']]) {
    const appDir = path.join(repo, 'dist', dir, 'cursor-zh-localizer.app');
    // 不加 hardened runtime：没�?JIT �?entitlements �?Electron �?runtime 下会�?    execFileSync(rcodesign, ['sign', appDir], { stdio: 'inherit' });
    const zip = path.join(repo, 'dist', `cursor-zh-electron-${desktopPkg.version}-mac-${arch}.zip`);
    await fs.rm(zip, { force: true });
    await fs.rm(`${zip}.blockmap`, { force: true });
    const zipArgs = zipTool === 'zip' ? ['-qry', zip, 'cursor-zh-localizer.app'] : ['a', '-tzip', '-snl', '-bso0', zip, 'cursor-zh-localizer.app'];
    execFileSync(zipTool, zipArgs, { cwd: path.dirname(appDir), stdio: 'inherit' });
    console.log(`· �?ad-hoc 签名并重新打�?${path.relative(repo, zip)}`);
  }
}

// Windows 安装包：�?electron-builder 缓存里的 Linux �?makensis 直接编译 apps/desktop/build/win/installer.nsi�?// 卸载程序由安装时�?WriteUninstaller 写出，所�?Linux 上不需�?wine。按用户安装、开始菜�?桌面快捷方式、控制面板可卸载�?if (has('--win')) {
  const cache = path.join(process.env.HOME || '', '.cache/electron-builder');
  const nsisDir = (await fs.readdir(cache).catch(() => [])).filter((d) => /^nsis-\d/.test(d)).sort().pop();
  const inner = nsisDir && (await fs.readdir(path.join(cache, nsisDir))).find((d) => d.startsWith('nsis-'));
  const NSISDIR = process.env.NSISDIR || (inner && path.join(cache, nsisDir, inner));
  if (!NSISDIR) console.log('· 未找�?makensis（electron-builder �?nsis 缓存），跳过安装�?);
  else {
    const out = path.join(repo, 'dist', `cursor-zh-electron-${desktopPkg.version}-win-x64-setup.exe`);
    execFileSync(path.join(NSISDIR, 'linux/makensis'), ['-V2', `-DVERSION=${desktopPkg.version}`, `-DSRCDIR=${path.join(repo, 'dist/win-unpacked')}`, `-DOUTFILE=${out}`, `-DICON=${path.join(desktop, 'build/icon.ico')}`, path.join(desktop, 'build/win/installer.nsi')],
      { stdio: 'inherit', env: { ...process.env, NSISDIR, NSISCONFDIR: NSISDIR } });
    console.log(`· 已生成安装包 ${path.relative(repo, out)}`);
  }
}
