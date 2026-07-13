import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const forbiddenDirs = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', 'package', 'releases']);
const required = [
  'package.json',
  'README.md',
  'README.en.md',
  'LICENSE',
  '.gitignore',
  'appinfo.json',
  'index.html',
  '.github/workflows/build.yml',
  'assets/icon.png',
  'assets/icon-512.png',
  'assets/backdrop.png',
  'src/styles.css',
  'src/store.js',
  'src/ddys-client.js',
  'src/focus.js',
  'src/player.js',
  'src/app.js',
  'docs/architecture.md',
  'docs/webos-notes.md',
  'examples/settings.json',
  'tools/check.mjs',
  'tools/build-package.ps1',
  'tests/core.test.mjs'
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function exists(relative) {
  try {
    await fs.access(path.join(root, relative));
    return true;
  } catch {
    return false;
  }
}

async function read(relative) {
  return fs.readFile(path.join(root, relative), 'utf8');
}

async function stat(relative) {
  return fs.stat(path.join(root, relative));
}

async function listFiles(dir = root, out = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (forbiddenDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await listFiles(full, out);
    else out.push(full);
  }
  return out;
}

async function main() {
  for (const file of required) assert(await exists(file), `Missing required file: ${file}`);

  const pkg = JSON.parse(await read('package.json'));
  assert(pkg.name === 'ddys-webos', 'package name mismatch.');
  assert(pkg.version === '0.1.0', 'package version mismatch.');
  assert(pkg.private === true, 'package must remain private.');
  assert(pkg.type === 'module', 'package must be ESM for tools.');
  assert(pkg.scripts?.test === 'node --test tests/*.test.mjs', 'test script mismatch.');
  assert(pkg.scripts?.package.includes('tools/build-package.ps1'), 'package script mismatch.');

  const appinfo = JSON.parse(await read('appinfo.json'));
  assert(appinfo.id === 'io.ddys.webos', 'appinfo id mismatch.');
  assert(appinfo.version === pkg.version, 'appinfo version mismatch.');
  assert(appinfo.type === 'web', 'appinfo type must be web.');
  assert(appinfo.main === 'index.html', 'appinfo main mismatch.');
  assert(appinfo.icon === 'assets/icon.png', 'appinfo icon mismatch.');
  assert(appinfo.largeIcon === 'assets/icon-512.png', 'appinfo largeIcon mismatch.');
  assert(appinfo.resolution === '1920x1080', 'appinfo resolution mismatch.');

  const html = await read('index.html');
  for (const fragment of [
    'src/store.js',
    'src/ddys-client.js',
    'src/focus.js',
    'src/player.js',
    'src/app.js',
    'playerScreen',
    'videoPlayer'
  ]) {
    assert(html.includes(fragment), `index.html missing ${fragment}.`);
  }
  assert(!/<script[^>]+type=["']module["']/iu.test(html), 'webOS app should not rely on ES modules.');
  assert(!/<script[^>]+src=["']https?:/iu.test(html), 'App must not load remote scripts.');

  const client = await read('src/ddys-client.js');
  for (const fragment of ['/latest', '/hot', '/movies', '/search', '/sources', 'XMLHttpRequest', 'classifyUrl', 'sourceUrl', 'streamUrl', 'includeExternal']) {
    assert(client.includes(fragment), `client missing ${fragment}.`);
  }
  for (const kind of ['magnet', 'ed2k', 'torrent', 'playable', 'link', 'unknown']) {
    assert(client.includes(`'${kind}'`), `resource kind missing ${kind}.`);
  }
  assert(!client.includes('x-ddys-client'), 'default requests should avoid custom headers that trigger CORS preflight.');

  const focus = await read('src/focus.js');
  for (const fragment of ['getBoundingClientRect', 'scrollIntoView', 'mouseenter', 'pointerover']) {
    assert(focus.includes(fragment), `focus manager missing ${fragment}.`);
  }

  const player = await read('src/player.js');
  for (const fragment of ['videoPlayer', 'loadedmetadata', 'currentTime', 'canPlayType', 'onProgress']) {
    assert(player.includes(fragment), `player missing ${fragment}.`);
  }

  const app = await read('src/app.js');
  for (const fragment of ['renderHome', 'renderSearch', 'renderDetail', 'renderFavorites', 'renderHistory', 'renderSettings', 'renderCheck', 'KEY_CODES', 'back: 461', "activeView = 'category'", "activeView = 'detail'", 'continueHtml', 'recordProgress', 'closest(', 'readNumber']) {
    assert(app.includes(fragment), `app missing ${fragment}.`);
  }

  const css = await read('src/styles.css');
  for (const fragment of ['.movie-card', '.is-focused', '.player-screen', '.resource-item', '.settings', '.continue-card']) {
    assert(css.includes(fragment), `styles missing ${fragment}.`);
  }
  assert(!/radial-gradient|circle at|FillEllipse/iu.test(css), 'styles should avoid orb-like backgrounds.');

  const readme = await read('README.md');
  for (const fragment of ['webOS', 'Magic Remote', 'Back 键', '.ipk', '继续观看', '自检']) {
    assert(readme.includes(fragment), `README missing ${fragment}.`);
  }
  assert(!readme.includes('## **开发打包**'), 'README contains unwanted developer packaging section.');

  const workflow = await read('.github/workflows/build.yml');
  assert(workflow.includes('node --check src/app.js'), 'workflow must syntax-check app.');
  assert(workflow.includes('node --test tests/*.test.mjs'), 'workflow must run tests.');
  assert(workflow.includes('tools/build-package.ps1'), 'workflow must build packages.');
  assert(workflow.includes('ddys-webos-v0.1.0.ipk'), 'workflow artifact must include ipk.');

  const script = await read('tools/build-package.ps1');
  assert(script.includes('ddys-webos-v{0}.ipk'), 'build script must produce ipk.');
  assert(script.includes('debian-binary'), 'build script must build ipk ar entries.');
  assert(script.includes('usr\\palm\\applications\\{0}') && script.includes('$AppId'), 'build script must place app under webOS application path.');
  assert(script.includes('Assert-InRoot'), 'build script must guard recursive paths.');
  assert(script.includes('ZipFileExtensions'), 'build script must use ZipArchive API.');

  assert((await stat('assets/icon.png')).size > 1000, 'icon.png looks too small.');
  assert((await stat('assets/backdrop.png')).size > 1000, 'backdrop.png looks too small.');

  const files = await listFiles();
  for (const file of files) {
    const relative = path.relative(root, file).replaceAll(path.sep, '/');
    assert(!relative.includes('/node_modules/'), 'node_modules must not be included.');
    assert(!relative.includes('/package/'), 'package directory must not be included.');
    assert(!relative.endsWith('.ipk'), 'generated ipk must not be included.');
    assert(!relative.endsWith('.zip'), 'generated zip must not be included.');
  }

  const textFiles = files.filter((file) => /\.(js|mjs|html|css|md|json|xml|yml|yaml|ps1|gitignore)$/i.test(file));
  const allText = (await Promise.all(textFiles.map((file) => fs.readFile(file, 'utf8')))).join('\n');
  assert(!/ghp_[A-Za-z0-9_]+/.test(allText), 'GitHub token-like value found.');
  assert(!/github_pat_[A-Za-z0-9_]+/.test(allText), 'GitHub fine-grained token-like value found.');
  assert(!/npm_[A-Za-z0-9_]+/.test(allText), 'npm token-like value found.');
  assert(!/sk-[A-Za-z0-9]{20,}/.test(allText), 'OpenAI token-like value found.');
  assert(!allText.includes('\uFFFD'), 'Replacement character found.');

  console.log(JSON.stringify({ ok: true, package: 'ddys-webos', files: files.length }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
