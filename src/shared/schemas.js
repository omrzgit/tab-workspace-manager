/**
 * Entity schema validators + Export Document contract (spec Â§3).
 * Pure functions; throw SchemaViolationError at the parsing layer so
 * corrupted imports halt before any storage write occurs.
 */
import { LIMITS, VALIDATION_MESSAGES } from './constants.js';

export class SchemaViolationError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'SchemaViolationError';
  }
}

/**
 * Validates a user-entered group name.
 * @param {unknown} raw
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
export function validateGroupName(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, error: VALIDATION_MESSAGES.NAME_EMPTY };
  }
  const value = raw.trim();
  if (value.length > LIMITS.GROUP_NAME_MAX) {
    return {
      ok: false,
      error: `Group name must be at most ${LIMITS.GROUP_NAME_MAX} characters`,
    };
  }
  return { ok: true, value };
}

/**
 * Validates a Settings Record with default fallback injection.
 * @param {unknown} raw
 * @returns {{
 *   ignorePinnedTabs: boolean,
 *   closeTabsOnSaveGroup: boolean,
 *   autoExportJson: boolean,
 *   autoExportTrigger: 'tab_open'|'timer'|'both',
 *   autoExportTimerMinutes: number,
 *   periodicDriveBackup: boolean,
 *   periodicDriveBackupMinutes: number,
 * }}
 */
export function validateSettings(raw) {
  const source = raw !== null && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  const validTriggers = ['tab_open', 'timer', 'both'];
  const trigger = typeof source.autoExportTrigger === 'string' && validTriggers.includes(source.autoExportTrigger)
    ? source.autoExportTrigger
    : 'both';
  const exportTimer = Number.isInteger(source.autoExportTimerMinutes) && Number(source.autoExportTimerMinutes) > 0
    ? Number(source.autoExportTimerMinutes)
    : 15;
  const driveTimer = Number.isInteger(source.periodicDriveBackupMinutes) && Number(source.periodicDriveBackupMinutes) > 0
    ? Number(source.periodicDriveBackupMinutes)
    : 30;

  return {
    ignorePinnedTabs: typeof source.ignorePinnedTabs === 'boolean' ? source.ignorePinnedTabs : true,
    closeTabsOnSaveGroup: typeof source.closeTabsOnSaveGroup === 'boolean' ? source.closeTabsOnSaveGroup : false,
    autoExportJson: typeof source.autoExportJson === 'boolean' ? source.autoExportJson : false,
    autoExportTrigger: /** @type {'tab_open'|'timer'|'both'} */ (trigger),
    autoExportTimerMinutes: exportTimer,
    periodicDriveBackup: typeof source.periodicDriveBackup === 'boolean' ? source.periodicDriveBackup : false,
    periodicDriveBackupMinutes: driveTimer,
  };
}

/**
 * Structural guard for the Export Document contract (JSON Schema equivalent of:
 * required ["tabGroups"], each group required ["name","links"], each link
 * required ["name","link"], name 1..100, order/icon/id nullable integers/strings).
 * Corrupted payloads halt execution immediately at the parsing layer.
 * @param {unknown} document
 * @returns {Array<{ name: string, order?: number|null, links: Array<object> }>}
 */
export function parseExportDocument(document) {
  if (document === null || typeof document !== 'object') {
    throw new SchemaViolationError('Malformed import: root payload must be an object.');
  }
  const { tabGroups } = /** @type {Record<string, unknown>} */ (document);
  if (!Array.isArray(tabGroups)) {
    throw new SchemaViolationError('Malformed import: "tabGroups" must be an array.');
  }

  return tabGroups.map((group) => {
    if (group === null || typeof group !== 'object') {
      throw new SchemaViolationError('Malformed import: group entries must be objects.');
    }
    const record = /** @type {Record<string, unknown>} */ (group);
    if (typeof record.name !== 'string'
      || record.name.length < 1
      || record.name.length > LIMITS.GROUP_NAME_EXPORT_MAX) {
      throw new SchemaViolationError(
        `Malformed import: group "name" must be a string of 1â€“${LIMITS.GROUP_NAME_EXPORT_MAX} chars.`,
      );
    }
    if (!Array.isArray(record.links)) {
      throw new SchemaViolationError('Malformed import: group "links" must be an array.');
    }
    if (record.order !== undefined && record.order !== null
      && !Number.isInteger(record.order)) {
      throw new SchemaViolationError('Malformed import: group "order" must be an integer or null.');
    }

    const links = record.links.map((link) => {
      if (link === null || typeof link !== 'object') {
        throw new SchemaViolationError('Malformed import: link entries must be objects.');
      }
      const linkRecord = /** @type {Record<string, unknown>} */ (link);
      if (typeof linkRecord.name !== 'string') {
        throw new SchemaViolationError('Malformed import: link "name" must be a string.');
      }
      if (typeof linkRecord.link !== 'string') {
        throw new SchemaViolationError('Malformed import: link "link" must be a URI string.');
      }
      if (linkRecord.id !== undefined && linkRecord.id !== null
        && typeof linkRecord.id !== 'string' && typeof linkRecord.id !== 'number') {
        throw new SchemaViolationError('Malformed import: link "id" must be a string, number, or null.');
      }
      if (linkRecord.icon !== undefined && linkRecord.icon !== null
        && typeof linkRecord.icon !== 'string') {
        throw new SchemaViolationError('Malformed import: link "icon" must be a string or null.');
      }
      if (linkRecord.order !== undefined && linkRecord.order !== null
        && !Number.isInteger(linkRecord.order)) {
        throw new SchemaViolationError('Malformed import: link "order" must be an integer or null.');
      }
      return linkRecord;
    });

    const parsed = /** @type {*} */ ({ name: record.name, links });
    if (record.order !== undefined) parsed.order = record.order;
    return parsed;
  });
}

/**
 * Builds the Export Document honoring the documented contract
 * ($schema, title, type, required, properties tree).
 * @param {Array<{ name: string, links: Array<object>, order?: number }>} groups
 * @returns {object}
 */
export function buildExportDocument(groups) {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'TabGroupsExportPayload',
    type: 'object',
    required: ['tabGroups'],
    properties: {
      tabGroups: groups.map((group) => {
        const exported = /** @type {*} */ ({
          name: group.name.slice(0, LIMITS.GROUP_NAME_EXPORT_MAX),
          order: Number.isInteger(group.order) ? group.order : null,
          links: group.links.map((link) => ({
            id: link.id ?? null,
            name: link.name,
            link: link.link,
            icon: link.icon ?? null,
            order: Number.isInteger(link.order) ? link.order : null,
          })),
        });
        return exported;
      }),
    },
  };
}