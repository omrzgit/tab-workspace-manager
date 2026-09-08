/**
 * Canonical constants shared across every execution context
 * (popup UI, background service worker, storage layer).
 */

/** Synchronized storage keys. */
export const STORAGE_KEYS = Object.freeze({
  /** Partition manifest + legacy home of the primary groups dataset. */
  GROUPS: 'tabGroups',
  /** User-level configuration record. */
  SETTINGS: 'tabGroupSettings',
  /** Persistence layout iteration tracker driving cold-launch migrations. */
  VERSION: 'tabGroupVersion',
});

/** Current persistence layout version. */
export const SCHEMA_VERSION = 2.0;

/** Approved protocol schemes. Anything else is discarded on import, disabled on restore. */
export const ALLOWED_LINK_SCHEMES = Object.freeze([
  'http', 'https', 'ftp', 'file', 'chrome', 'about',
]);

/** Entity constraints. */
export const LIMITS = Object.freeze({
  GROUP_NAME_MIN: 1,
  GROUP_NAME_MAX: 90,
  GROUP_NAME_EXPORT_MAX: 100,
  LINK_NAME_MAX: 255,
});

/** Preview favicon collections are rendered for the first N links per window. */
export const FAVICON_PREVIEW_LIMIT = 7;

/** Default geometry for "Open in New Window". */
export const NEW_WINDOW_GEOMETRY = Object.freeze({ width: 1024, height: 768 });

/** Auto-Save on Close group naming. */
export const AUTO_SAVE_GROUP_NAME = 'Auto-Save (Window Close)';

/** Deterministic import/autosave collision suffix pattern: {groupName}_imported_{N}. */
export const CONFLICT_SUFFIX = '_imported_';

/** chrome.storage.sync per-item quota (bytes) with a defensive safety margin. */
export const SAFE_CHUNK_BYTES = 7000;

/** Retry delay for queued remote backups. */
export const REMOTE_BACKUP_RETRY_MS = 30_000;

/** Auto-export document filename (overwritten on each export). */
export const AUTO_EXPORT_FILENAME = 'TabWorkspaces_AutoBackup.json';

/** Alarm identifiers for chrome.alarms. */
export const ALARM_NAMES = Object.freeze({
  AUTO_EXPORT: 'twm-auto-export',
  PERIODIC_DRIVE: 'twm-periodic-drive',
});

/** User-level settings defaults. */
export const DEFAULT_SETTINGS = Object.freeze({
  ignorePinnedTabs: true,
  closeTabsOnSaveGroup: false,
  autoExportJson: false,
  autoExportTrigger: 'both', // 'tab_open' | 'timer' | 'both'
  autoExportTimerMinutes: 15,
  periodicDriveBackup: false,
  periodicDriveBackupMinutes: 30,
});

/** Inter-component message bus event names. */
export const BUS_EVENTS = Object.freeze({
  RELOAD_CONTEXT_MENU: 'RELOAD_CONTEXT_MENU',
  SESSION_CAPTURED_EVENT: 'SESSION_CAPTURED_EVENT',
});

/** Message bus source discriminators. */
export const BUS_SOURCES = Object.freeze({
  POPUP_MUTATION: 'POPUP_MUTATION',
  WINDOW_CLOSE: 'WINDOW_CLOSE',
});

/** User-facing validation copy. */
export const VALIDATION_MESSAGES = Object.freeze({
  NAME_EMPTY: "Group name can't be empty",
  NAME_DUPLICATE: 'Group with such name already exist',
});