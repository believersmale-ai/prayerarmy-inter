#!/usr/bin/env node
/**
 * Read-only Node production smoke checks.
 * Usage: node scripts/smoke-production.mjs https://prayerarmyinternational.com
 * Never posts data, logs response bodies or requests private endpoints.
 */
import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://127.0.0.1:3000';
const origin = new URL(base);
if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('HTTP(S) base URL required');
const checks = [
  { path: '/', validate: async (r) => assert.equal(r.status, 200) },
  { path: '/api/runtime', validate: async (r) => {
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.backend, 'node');
    assert.equal(data.ready, true);
    if (process.argv.includes('--require-durable-media')) assert.equal(data.mediaStorageDurable, true, 'Production media storage must be durable');
  } },
  { path: '/api/health/db', validate: async (r) => {
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.success, true);
    assert.equal(data.database, true);
  } },
  { path: '/api/settings', validate: async (r) => {
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(typeof data, 'object');
    assert.ok(data && !Array.isArray(data));
    assert.equal(Object.hasOwn(data, 'passkey'), false, 'Passkey must never be public');
    assert.equal(Object.hasOwn(data, 'notifications'), false, 'Internal notification settings must never be public');
  } },
  { path: '/api/admin/submissions', validate: async (r) => {
    assert.equal(r.status, 401, 'Anonymous users must not read private submissions');
  } },
  { path: '/api/media', validate: async (r) => {
    assert.equal(r.status, 401, 'Anonymous users must not list private media');
  } }
];
let failures = 0;
for (const { path, validate } of checks) {
  const url = new URL(path, origin);
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } });
    await validate(response);
    console.log('PASS', path, response.status);
  } catch (err) {
    failures++;
    console.error('FAIL', path, err.message);
  }
}
if (failures) {
  console.error(`${failures} smoke check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('All read-only smoke checks passed');
}
