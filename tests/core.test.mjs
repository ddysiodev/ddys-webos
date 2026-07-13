import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadClient() {
  const sandbox = {
    window: {},
    globalThis: {},
    console,
    Date,
    Promise,
    setTimeout,
    clearTimeout,
    XMLHttpRequest: function () {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'src/ddys-client.js'), 'utf8'), sandbox);
  return sandbox.DDYSClient;
}

const DDYSClient = loadClient();

test('settings and URL builder support API key modes', () => {
  const settings = DDYSClient.normalizeSettings({
    apiBase: 'https://api.example.test/',
    apiKey: 'abc',
    apiKeyMode: 'query',
    pageSize: 999,
    cacheTtlSeconds: 0
  });
  assert.equal(settings.apiBase, 'https://api.example.test');
  assert.equal(settings.pageSize, 100);
  assert.equal(settings.cacheTtlSeconds, 0);
  assert.equal(
    DDYSClient.buildUrl(settings, '/search', { q: '电影' }),
    'https://api.example.test/search?q=%E7%94%B5%E5%BD%B1&api_key=abc'
  );
  assert.equal(DDYSClient.normalizeSettings({ apiKeyMode: 'bad' }).apiKeyMode, 'query');
});

test('client normalizes movie lists and caches requests', async () => {
  const calls = [];
  const client = DDYSClient.create({ apiBase: 'https://api.example.test', cacheTtlSeconds: 60 }, {
    request(url) {
      calls.push(url);
      return Promise.resolve({ data: { items: [{ id: 1, slug: 'a', title: 'A', cover: 'https://img.test/a.jpg' }] } });
    }
  });
  const first = await client.latest();
  const second = await client.latest();
  assert.equal(first[0].title, 'A');
  assert.equal(second[0].poster, 'https://img.test/a.jpg');
  assert.equal(calls.length, 1);
});

test('resource classifier and parser cover TV playback cases', () => {
  assert.equal(DDYSClient.classifyUrl('https://x.test/video.mp4'), 'playable');
  assert.equal(DDYSClient.classifyUrl('https://x.test/live.m3u8'), 'playable');
  assert.equal(DDYSClient.classifyUrl('https://x.test/manifest.mpd'), 'playable');
  assert.equal(DDYSClient.classifyUrl('magnet:?xt=urn:btih:123'), 'magnet');
  assert.equal(DDYSClient.classifyUrl('ed2k://|file|a|1|hash|/'), 'ed2k');
  assert.equal(DDYSClient.classifyUrl('https://x.test/file.torrent'), 'torrent');
  assert.equal(DDYSClient.classifyUrl('https://x.test/page'), 'link');

  const resources = DDYSClient.readResources({
    data: {
      sources: [
        { title: 'HLS', sourceUrl: 'https://x.test/stream.m3u8' },
        { title: 'Cloud', url: 'https://cloud.test/share' }
      ],
      magnet: 'magnet:?xt=urn:btih:abc'
    }
  }, { title: 'Movie' }, { includeExternal: true });
  assert.equal(resources.length, 3);
  assert.equal(resources[0].playable, true);
  assert.equal(resources[1].kind, 'link');
  assert.equal(resources[2].kind, 'magnet');
  assert.equal(DDYSClient.readResources({ data: { url: 'https://cloud.test/share' } }, null, { includeExternal: false }).length, 0);
});

test('movieWithResources returns public objects without raw payloads', async () => {
  const client = DDYSClient.create({ apiBase: 'https://api.example.test' }, {
    request(url) {
      if (url.indexOf('/sources') >= 0) {
        return Promise.resolve({ data: { online: [{ title: 'MP4', url: 'https://x.test/a.mp4' }] } });
      }
      return Promise.resolve({ data: { id: 1, slug: 'a', title: 'A', raw_secret: 'x' } });
    }
  });
  const result = await client.movieWithResources('a');
  assert.equal(result.movie.raw, undefined);
  assert.equal(result.resources[0].raw, undefined);
  assert.equal(result.resources[0].mimeType, 'video/mp4');
});

test('appinfo and HTML contain webOS runtime requirements', async () => {
  const appinfo = JSON.parse(await fs.promises.readFile(path.join(root, 'appinfo.json'), 'utf8'));
  const html = await fs.promises.readFile(path.join(root, 'index.html'), 'utf8');
  assert.equal(appinfo.id, 'io.ddys.webos');
  assert.equal(appinfo.type, 'web');
  assert.equal(appinfo.main, 'index.html');
  assert.equal(appinfo.icon, 'assets/icon.png');
  assert.match(html, /playerScreen/);
  assert.match(html, /videoPlayer/);
  assert.match(html, /src\/player\.js/);
});
