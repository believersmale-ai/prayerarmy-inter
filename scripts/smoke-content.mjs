#!/usr/bin/env node
/**
 * Read-only checks for the content API on a staging deployment.
 * Usage: node scripts/smoke-content.mjs https://STAGING-HOST
 * No mutations or authenticated requests. Does not print private content.
 */
import assert from 'node:assert/strict';

const base = process.argv[2];
if (!base) throw new Error('Pass the staging URL, e.g. https://staging.example.com');
const origin = new URL(base);
if (!['https:', 'http:'].includes(origin.protocol)) throw new Error('Expected an HTTP(S) URL');
const cases = [
  ['messages', ['id', 'title', 'description', 'link', 'media_url', 'media_type', 'notes_url', 'source', 'speaker', 'category', 'thumbnail_url', 'is_featured', 'created_at']],
  ['testimonies', ['id', 'name', 'location', 'testimony', 'created_at']],
  ['wall_prayers', ['id', 'name', 'request', 'prayed_count']]
];
let failures = 0;
for (const [resource, allowed] of cases) {
  const route = `/api/rest/v1/${resource}?limit=2`;
  try {
    const response = await fetch(new URL(route, origin), {
      headers: { Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(response.status, 200, `${resource} should return HTTP 200`);
    const rows = await response.json();
    assert.ok(Array.isArray(rows), 'Expected an array');
    assert.ok(rows.length <= 2, 'Server must respect limit=2');
    for (const row of rows) {
      assert.ok(row && typeof row === 'object' && !Array.isArray(row));
      for (const key of Object.keys(row)) {
        assert.ok(allowed.includes(key), `Unexpected public field: ${key}`);
      }
      assert.ok(row.id, 'Each record needs an ID');
    }
    console.log('PASS', route, `(${rows.length} rows)`);
  } catch (error) {
    failures++;
    console.error('FAIL', route, error.message);
  }
}
if (failures) process.exitCode = 1;
else console.log('All public content endpoint checks passed. Manual moderation checks still required.');
