import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceRepository } from '../src/storage/workspaceRepository.js';
import { SCHEMA_VERSION, STORAGE_KEYS } from '../src/shared/constants.js';

function fakeStorageArea() {
  const data = new Map();
  return {
    data,
    get(keys, cb) {
      const wanted = keys === null ? [...data.keys()] : (Array.isArray(keys) ? keys : [keys]);
      cb(Object.fromEntries(wanted.filter((k) => data.has(k)).map((k) => [k, data.get(k)])));
    },
    set(items, cb) {
      for (const [k, v] of Object.entries(items)) data.set(k, v);
      cb();
    },
    remove(keys, cb) {
      for (const k of Array.isArray(keys) ? keys : [keys]) data.delete(k);
      cb();
    },
  };
}

test('WorkspaceRepository saves and loads groups with partitioned storage', async () => {
  const area = fakeStorageArea();
  const repo = new WorkspaceRepository(area);

  await repo.init();
  const initial = await repo.loadGroups();
  assert.deepEqual(initial, []);

  const testGroups = [
    {
      name: 'Work',
      order: 0,
      links: [
        { name: 'GitHub', link: 'https://github.com', order: 0 },
        { name: 'Docs', link: 'https://developer.chrome.com', order: 1 },
      ],
    },
  ];

  await repo.saveGroups(testGroups);
  const loaded = await repo.loadGroups();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].name, 'Work');
  assert.equal(loaded[0].links.length, 2);
  assert.equal(loaded[0].links[0].name, 'GitHub');
});

test('WorkspaceRepository migrates legacy flat array to partitioned layout', async () => {
  const area = fakeStorageArea();
  area.data.set(STORAGE_KEYS.GROUPS, [
    {
      name: 'Legacy Workspace',
      links: [{ name: 'Example', link: 'https://example.com' }],
    },
  ]);

  const repo = new WorkspaceRepository(area);
  await repo.init();

  const loaded = await repo.loadGroups();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].name, 'Legacy Workspace');
  assert.equal(area.data.get(STORAGE_KEYS.VERSION), SCHEMA_VERSION);
});

test('WorkspaceRepository loads and saves settings correctly', async () => {
  const area = fakeStorageArea();
  const repo = new WorkspaceRepository(area);

  const defaultSettings = await repo.loadSettings();
  assert.equal(defaultSettings.ignorePinnedTabs, true);
  assert.equal(defaultSettings.closeTabsOnSaveGroup, false);

  const updated = await repo.saveSettings({ closeTabsOnSaveGroup: true });
  assert.equal(updated.closeTabsOnSaveGroup, true);
  assert.equal(updated.ignorePinnedTabs, true);

  const reloaded = await repo.loadSettings();
  assert.equal(reloaded.closeTabsOnSaveGroup, true);
  assert.equal(reloaded.ignorePinnedTabs, true);
});

test('WorkspaceRepository handles corrupt payload gracefully', async () => {
  const area = fakeStorageArea();
  area.data.set('tabGroups', { partCount: 1 });
  area.data.set('tabGroups_part_0', 'invalid json{');

  const repo = new WorkspaceRepository(area);
  const loaded = await repo.loadGroups();
  assert.deepEqual(loaded, []);
});
