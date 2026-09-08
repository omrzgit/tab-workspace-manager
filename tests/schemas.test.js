import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExportDocument, parseExportDocument, SchemaViolationError, validateGroupName, validateSettings,
} from '../src/shared/schemas.js';

test('blank names are blocked with the exact spec message', () => {
  assert.equal(validateGroupName('   ').error, "Group name can't be empty");
  assert.deepEqual(validateGroupName(' Work '), { ok: true, value: 'Work' });
});

test('validateSettings enforces defaults and handles new auto-export and drive settings', () => {
  const defaults = validateSettings({});
  assert.equal(defaults.autoExportJson, false);
  assert.equal(defaults.autoExportTrigger, 'both');
  assert.equal(defaults.autoExportTimerMinutes, 15);
  assert.equal(defaults.periodicDriveBackup, false);
  assert.equal(defaults.periodicDriveBackupMinutes, 30);

  const custom = validateSettings({
    autoExportJson: true,
    autoExportTrigger: 'timer',
    autoExportTimerMinutes: 20,
    periodicDriveBackup: true,
    periodicDriveBackupMinutes: 120,
  });
  assert.equal(custom.autoExportJson, true);
  assert.equal(custom.autoExportTrigger, 'timer');
  assert.equal(custom.autoExportTimerMinutes, 20);
  assert.equal(custom.periodicDriveBackup, true);
  assert.equal(custom.periodicDriveBackupMinutes, 120);
});

test('corrupted import payloads halt at the parsing layer', () => {
  assert.throws(() => parseExportDocument({ tabGroups: 'nope' }), SchemaViolationError);
  assert.throws(() => parseExportDocument({ tabGroups: [{ links: [] }] }), SchemaViolationError);
  assert.throws(() => parseExportDocument({ tabGroups: [{ name: 'x', links: [{ name: 1, link: 'https://a' }] }] }), SchemaViolationError);
  assert.doesNotThrow(() => parseExportDocument({ tabGroups: [{ name: 'x', links: [{ name: 'n', link: 'https://a', id: null, icon: null, order: null }] }] }));
});

test('export document matches the documented contract envelope', () => {
  const doc = buildExportDocument([{ name: 'G', order: 0, links: [{ name: 'n', link: 'https://a', order: 0 }] }]);
  assert.equal(doc.title, 'TabGroupsExportPayload');
  assert.deepEqual(doc.required, ['tabGroups']);
  assert.equal(doc.properties.tabGroups[0].links[0].icon, null);
});