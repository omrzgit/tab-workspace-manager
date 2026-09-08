import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeImportedGroups } from '../src/popup/sessionExchange.js';
import { SchemaViolationError } from '../src/shared/schemas.js';

test('mergeImportedGroups merges valid import and resolves name conflicts', () => {
  const existing = [
    {
      name: 'Dev',
      order: 0,
      links: [{ name: 'GH', link: 'https://github.com', order: 0 }],
    },
  ];

  const importJson = JSON.stringify({
    tabGroups: [
      {
        name: 'Dev',
        links: [{ name: 'New GH', link: 'https://github.com/new' }],
      },
      {
        name: 'Reading',
        links: [{ name: 'Book', link: 'https://books.com' }],
      },
    ],
  });

  const merged = mergeImportedGroups(importJson, existing);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].name, 'Dev');
  assert.equal(merged[1].name, 'Dev_imported_1');
  assert.equal(merged[2].name, 'Reading');
  assert.equal(merged[1].order, 1);
  assert.equal(merged[2].order, 2);
});

test('mergeImportedGroups drops unsafe schemes and eliminates empty groups', () => {
  const importJson = JSON.stringify({
    tabGroups: [
      {
        name: 'BadGroup',
        links: [{ name: 'XSS', link: 'javascript:alert(1)' }],
      },
    ],
  });

  const merged = mergeImportedGroups(importJson, []);
  assert.deepEqual(merged, []);
});

test('mergeImportedGroups throws on malformed JSON or schema breaches', () => {
  assert.throws(() => mergeImportedGroups('not json', []), /Malformed import/);
  assert.throws(() => mergeImportedGroups('{"tabGroups":"bad"}', []), SchemaViolationError);
});
