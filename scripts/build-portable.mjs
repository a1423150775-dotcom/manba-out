import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync, statSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const project = resolve(import.meta.dirname, '..');
const release = join(project, 'release');
const platform = process.platform === 'win32' ? 'Windows' : process.platform === 'linux' ? 'Linux' : process.platform === 'darwin' ? 'macOS' : null;
const arch = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : null;
if (!platform || !arch) throw new Error(`不支持当前构建平台：${process.platform}/${process.arch}`);
if (platform === 'Windows' && arch !== 'x64') throw new Error('本脚本当前只交付 Windows x64。');
const web = join(project, 'dist', 'web');
const bundled = join(project, 'dist', 'server', 'portable.cjs');
if (!existsSync(join(web, 'index.html')) || !existsSync(bundled)) throw new Error('请先运行 npm run build:portable:bundle。');
mkdirSync(release, { recursive: true });
const stage = mkdtempSync(join(release, '.portable-stage-'));
const packageRoot = join(stage, 'ElbowMayhem');
const { version } = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'));
const zipName = `ElbowMayhem-${platform}-${arch}-v${version}.zip`;
const zipPath = join(release, zipName);
try {
  mkdirSync(packageRoot);
  mkdirSync(join(packageRoot, 'data'));
  mkdirSync(join(packageRoot, 'logs'));
  cpSync(web, join(packageRoot, 'web'), { recursive: true });
  copyFileSync(bundled, join(packageRoot, 'server.cjs'));
  for (const name of ['launcher.cjs', 'stop.cjs', 'config.json', 'README.txt']) copyFileSync(join(project, 'portable', name), join(packageRoot, name));
  copyFileSync(join(project, 'portable', 'NODE_LICENSE.txt'), join(packageRoot, 'NODE_LICENSE.txt'));
  const lock = JSON.parse(readFileSync(join(project, 'package-lock.json'), 'utf8'));
  const licenseDir = join(packageRoot, 'licenses');
  mkdirSync(licenseDir);
  const notices = ['打包依赖许可证清单（版本以 package-lock.json 为准）', 'Node.js 的完整许可及内含组件声明见 NODE_LICENSE.txt。', ''];
  for (const [name, meta] of Object.entries(lock.packages)) {
    if (!name.startsWith('node_modules/') || meta.dev) continue;
    const source = join(project, name);
    const file = existsSync(source) ? readdirSync(source).find(item => /^(LICENSE|LICENCE|COPYING)(\..*)?$/i.test(item)) : null;
    const label = name.slice('node_modules/'.length).replaceAll('/', '__');
    if (file) copyFileSync(join(source, file), join(licenseDir, `${label}.txt`));
    notices.push(`${name.slice('node_modules/'.length)} ${meta.version || ''} · ${meta.license || '许可证见包目录'} · ${file ? `licenses/${label}.txt` : '无独立许可证文件'}`);
  }
  writeFileSync(join(packageRoot, 'THIRD_PARTY_NOTICES.txt'), notices.join('\n'), 'utf8');
  const executable = platform === 'Windows' ? 'GameServer.exe' : 'GameServer';
  copyFileSync(process.execPath, join(packageRoot, executable));
  if (platform === 'Windows') {
    for (const name of ['start.bat', 'stop.bat']) copyFileSync(join(project, 'portable', name), join(packageRoot, name));
  } else {
    for (const name of ['start.sh', 'stop.sh']) {
      copyFileSync(join(project, 'portable', name), join(packageRoot, name));
      chmodSync(join(packageRoot, name), 0o755);
    }
    chmodSync(join(packageRoot, executable), 0o755);
  }
  writeFileSync(join(packageRoot, 'data', '.keep'), '');
  writeFileSync(join(packageRoot, 'logs', '.keep'), '');
  const result = platform === 'Windows'
    ? spawnSync('tar.exe', ['-a', '-c', '-f', zipPath, 'ElbowMayhem'], { cwd: stage, encoding: 'utf8' })
    : spawnSync('zip', ['-q', '-r', zipPath, 'ElbowMayhem'], { cwd: stage, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`ZIP 创建失败：${result.stderr || result.stdout}`);
  const digest = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
  console.log(`${zipPath}\nsize=${statSync(zipPath).size}\nsha256=${digest}`);
} finally {
  const safe = resolve(stage).startsWith(resolve(release) + '\\') || resolve(stage).startsWith(resolve(release) + '/');
  if (safe) rmSync(stage, { recursive: true, force: true });
}
