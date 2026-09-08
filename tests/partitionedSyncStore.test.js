import test from 'node:test';
import assert from 'node:assert/strict';
import { PartitionedSyncStore } from '../src/storage/partitionedSyncStore.js';

/** Minimal in-memory StorageArea double. */
function fakeStorageArea() {
  const data = new Map();
  return {
    data,
    get(keys, cb) {
      const wanted = keys === null ? [...data.keys()] : (Array.isArray(keys) ? keys : [keys]);
      cb(Object.fromEntries(wanted.filter((k) => data.has(k)).map((k) => [k, data.get(k)])));
    },
    set(items, cb) { for (const [k, v] of Object.entries(items)) data.set(k, v); cb(); },
    remove(keys, cb) { for (const k of Array.isArray(keys) ? keys : [keys]) data.delete(k); cb(); },
  };
}

test('large payloads are partitioned, reassembled, and stale parts pruned', async () => {
  const area = fakeStorageArea();
  const store = new PartitionedSyncStore(area, 'tabGroups');

  const big = JSON.stringify({ pad: 'x'.repeat(20_000) });
  await store.write(big);
  const partKeys = [...area.data.keys()].filter((k) => k.startsWith('tabGroups_part_'));
  assert.ok(partKeys.length > 2, 'payload must span multiple partitions');
  assert.equal(await store.read(), big);

  const small = JSON.stringify([1, 2, 3]);
  await store.write(small);
  const remaining = [...area.data.keys()].filter((k) => k.startsWith('tabGroups_part_'));
  assert.equal(remaining.length, 1, 'surplus partitions must be removed');
  assert.equal(await store.read(), small);
});

test('missing partitions signal null so callers fall back to defaults', async () => {
  const area = fakeStorageArea();
  const store = new PartitionedSyncStore(area, 'tabGroups');
  await store.write(JSON.stringify({ pad: 'y'.repeat(15_000) }));
  area.data.delete('tabGroups_part_1');
  assert.equal(await store.read(), null);
});