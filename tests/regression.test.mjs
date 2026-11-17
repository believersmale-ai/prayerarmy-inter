import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

let server, base;
before(async () => {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  // No real database or administrator credentials are used by these routing tests.
  server = spawn(process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port), DB_HOST: '127.0.0.1', DB_PORT: '1',
      DB_USER: 'routing_test', DB_PASSWORD: '', DB_NAME: 'routing_test',
      ADMIN_EMAIL: '', ADMIN_INITIAL_PASSWORD: '', ADMIN_PASSKEY: '', ADMIN_FORCE_RESET: '',
      PAI_DATA_DIR: '', PAI_PUBLIC_ACCOUNTS_ENABLED: 'false' },
    stdio: 'ignore'
  });
  base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base)).ok) return; } catch {}
    if (server.exitCode !== null) throw Error('Test server exited');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw Error('Test server did not start');
});
after(() => server?.kill());

test('homepage and dashboard scripts and styles are served', async () => {
  for (const path of ['/', '/admin']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    const html = await response.text();
    const assets = [...html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g)]
      .map(match => new URL(match[1], base + path)).filter(url => url.origin === base);
    assert.ok(assets.length >= 3);
    for (const asset of assets) {
      const resource = await fetch(asset);
      assert.equal(resource.status, 200, asset.pathname);
      assert.match(resource.headers.get('content-type'), /javascript|css/, asset.pathname);
    }
  }
});
test('admin aliases canonicalize trailing slashes', async () => {
  for (const path of ['/admin/', '/manage/', '/portal/']) {
    const response = await fetch(base + path, { redirect: 'manual' });
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('location'), path.slice(0, -1));
  }
});
test('missing pages and server sources are real 404s', async () => {
  for (const path of ['/missing-page', '/server.js', '/database.js', '/node-auth.js', '/node-common.js', '/node-content.js', '/node-pages.js', '/api/config.php', '/.git/config']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
});
test('private APIs reject anonymous callers', async () => {
  for (const path of ['/api/admin/submissions', '/api/media', '/api/admin/session']) {
    assert.equal((await fetch(base + path)).status, 401, path);
  }
  assert.equal((await fetch(base + '/api/functions/v1/manage-content', { method: 'POST',
    headers: { Origin: base.replace('http:', 'https:'), 'X-Forwarded-Proto': 'https', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list_prayer_requests' }) })).status, 401);
});
test('form protection fails closed when storage is unavailable', async () => {
  const response = await fetch(base + '/api/form-token');
  assert.equal(response.status, 503);
  assert.equal((await response.json()).token, undefined);
  for (const resource of ['prayer_requests', 'connect_requests']) {
    const r = await fetch(base + '/api/rest/v1/' + resource, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Test', _ft: '1234567890.' + 'a'.repeat(32) }) });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /refresh/);
  }
});
test('cookie authentication changes require a same-origin request', async () => {
  for (const path of ['/api/admin/login', '/api/admin/logout', '/api/verify-passkey']) {
    assert.equal((await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  }
});

const phpBase = process.env.PHP_TEST_URL;
test('Apache/PHP public routes and private file protections', { skip: !phpBase }, async () => {
  const headers = { 'X-Forwarded-Proto': 'https' };
  for (const path of ['/', '/about', '/contact', '/privacy', '/terms', '/index.md', '/robots.txt', '/llms.txt', '/sitemap.xml', '/.well-known/mcp/server-card.json']) {
    assert.equal((await fetch(phpBase + path, { headers })).status, 200, path);
  }
  for (const path of ['/api/config.php', '/api/lib.php', '/api/schema.sql', '/server.js', '/node-auth.js', '/tests/database.integration.mjs', '/.git/config']) {
    assert.equal((await fetch(phpBase + path, { headers })).status, 403, path);
  }
  assert.equal((await fetch(phpBase + '/no-such-page', { headers })).status, 404);
  const md = await fetch(phpBase + '/', { headers: { ...headers, Accept: 'text/markdown' } });
  assert.match(md.headers.get('content-type'), /text\/markdown/);
  const media = await fetch(phpBase + '/api/storage/v1/object/list/media', { method: 'POST', headers });
  assert.equal(media.status, 401);
});

test('runtime reports unavailable initialization without disclosing configuration', async () => {
  const response=await fetch(base+'/api/runtime');
  assert.deepEqual(await response.json(),{backend:'node',ready:false,mediaStorageDurable:false});
});
