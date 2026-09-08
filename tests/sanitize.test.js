import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedLinkUri, isAllowedIconUri, sanitizeGroup, resolveGroupNameConflict, normalizeGroups,
} from '../src/shared/sanitize.js';

test('link whitelist accepts approved schemes and rejects injection vectors', () => {
  for (const uri of ['http://a.b', 'https://a.b/x', 'ftp://h/f', 'file:///c/x',
    'chrome://settings', 'about:blank']) {
    assert.ok(isAllowedLinkUri(uri), uri);
  }
  for (const uri of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', 'not a url', '']) {
    assert.equal(isAllowedLinkUri(uri), false, uri);
  }
});

test('icon restriction: HTTP(S) or data:image/* only', () => {
  assert.ok(isAllowedIconUri('https://x/f.ico'));
  assert.ok(isAllowedIconUri('data:image/png;base64,AAAA'));
  assert.equal(isAllowedIconUri('data:text/html,x'), false);
  assert.equal(isAllowedIconUri('ftp://x/f.ico'), false);
});

test('groups with zero valid links are eliminated', () => {
  const group = sanitizeGroup({ name: 'G', links: [{ name: 'x', link: 'javascript:1' }] }, 0);
  assert.equal(group, null);
});

test('deterministic conflict suffix pattern {groupName}_imported_{N}', () => {
  const existing = new Set(['A', 'A_imported_1']);
  assert.equal(resolveGroupNameConflict('A', existing), 'A_imported_2');
  assert.equal(resolveGroupNameConflict('B', existing), 'B');
});

test('normalizeGroups re-indexes and coerces declared orders', () => {
  const out = normalizeGroups([
    { name: 'B', order: 5, links: [{ name: 'l', link: 'https://b' }] },
    { name: 'A', links: [{ name: 'l', link: 'https://a' }] },
  ]);
  assert.deepEqual(out.map((g) => g.name), ['B', 'A']);
  assert.equal(out[0].order, 5);
  assert.equal(out[1].order, 1);
});