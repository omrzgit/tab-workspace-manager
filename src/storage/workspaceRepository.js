/**
 * Persistence Client (Storage Abstraction Layer).
 * Sits between UI/background consumers and the platform storage engine.
 * Responsibilities: partitioned I/O, schema serialization, schema migration
 * on cold launch, and default fallback injection.
 */
import {
  DEFAULT_SETTINGS,
  SCHEMA_VERSION,
  STORAGE_KEYS,
} from '../shared/constants.js';
import { normalizeGroups } from '../shared/sanitize.js';
import { validateSettings } from '../shared/schemas.js';
import { PartitionedSyncStore } from './partitionedSyncStore.js';

export class WorkspaceRepository {
  /** @type {chrome.storage.StorageArea} */
  #area;
  /** @type {PartitionedSyncStore} */
  #store;

  /** @param {chrome.storage.StorageArea} [storageArea] */
  constructor(storageArea) {
    const area = storageArea ?? globalThis.chrome?.storage?.sync;
    if (!area) throw new Error('WorkspaceRepository requires chrome.storage.sync.');
    this.#area = area;
    this.#store = new PartitionedSyncStore(area, STORAGE_KEYS.GROUPS);
  }

  /** @template T @param {string|string[]} keys @returns {Promise<Record<string, T>>} */
  #get(keys) {
    return new Promise((resolve, reject) => {
      this.#area.get(keys, (items) => {
        const error = globalThis.chrome?.runtime?.lastError;
        if (error) reject(new Error(error.message));
        else resolve(items ?? {});
      });
    });
  }

  /** @param {Record<string, *>} items @returns {Promise<void>} */
  #set(items) {
    return new Promise((resolve, reject) => {
      this.#area.set(items, () => {
        const error = globalThis.chrome?.runtime?.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  }

  /** @returns {Promise<number|null>} */
  async #readVersion() {
    const items = await this.#get(STORAGE_KEYS.VERSION);
    const version = items[STORAGE_KEYS.VERSION];
    return typeof version === 'number' ? version : null;
  }

  /**
   * Cold-launch migration driver (spec: tabGroupVersion tracks persistence
   * layout iterations to drive data migrations on cold launch).
   * v-null/legacy â†’ v2.0: re-partition legacy flat arrays, sanitize, re-index.
   */
  async init() {
    const version = await this.#readVersion();

    const partitionedRaw = await this.#store.read();
    /** @type {unknown[]|null} */
    let groups = null;
    if (partitionedRaw !== null) {
      try {
        const parsed = JSON.parse(partitionedRaw);
        if (Array.isArray(parsed)) groups = parsed;
      } catch {
        groups = null; // corrupted partitions â‡’ fall through to legacy/default
      }
    }

    if (groups === null) {
      const legacyItems = await this.#get(STORAGE_KEYS.GROUPS);
      const legacy = legacyItems[STORAGE_KEYS.GROUPS];
      if (Array.isArray(legacy)) {
        groups = legacy; // legacy layout: un-partitioned array under tabGroups
      }
    }

    const normalized = normalizeGroups(groups ?? []);
    if (version !== SCHEMA_VERSION || groups === null) {
      await this.#store.write(JSON.stringify(normalized));
      await this.#set({ [STORAGE_KEYS.VERSION]: SCHEMA_VERSION });
    }
  }

  /** @returns {Promise<Array<{ name: string, links: Array<object>, order: number }>>} */
  async loadGroups() {
    try {
      const raw = await this.#store.read();
      if (raw === null) return [];
      const parsed = JSON.parse(raw);
      return normalizeGroups(Array.isArray(parsed) ? parsed : []);
    } catch {
      return []; // default fallback injection; never surface corrupt reads
    }
  }

  /**
   * Commits the full groups dataset to partitioned sync storage.
   * @param {Array<{ name: string, links: Array<object>, order: number }>} groups
   */
  async saveGroups(groups) {
    if (!Array.isArray(groups)) throw new TypeError('saveGroups expects an array.');
    await this.#store.write(JSON.stringify(normalizeGroups(groups)));
  }

  /** @returns {Promise<{ ignorePinnedTabs: boolean, closeTabsOnSaveGroup: boolean }>} */
  async loadSettings() {
    const items = await this.#get(STORAGE_KEYS.SETTINGS);
    return validateSettings(items[STORAGE_KEYS.SETTINGS]);
  }

  /**
   * @param {Partial<{ ignorePinnedTabs: boolean, closeTabsOnSaveGroup: boolean }>} patch
   */
  async saveSettings(patch) {
    const current = await this.loadSettings();
    const next = validateSettings({ ...current, ...patch });
    await this.#set({ [STORAGE_KEYS.SETTINGS]: next });
    return next;
  }

  /**
   * Subscribes to external dataset mutations (e.g., SESSION_CAPTURED_EVENT
   * writes from the background worker). Returns an unsubscribe function.
   * @param {() => void} callback
   * @returns {() => void}
   */
  subscribeToChanges(callback) {
    if (!globalThis.chrome?.storage?.onChanged?.addListener) {
      return () => {};
    }
    const relevant = new RegExp(`^${STORAGE_KEYS.GROUPS}(_part_\\d+)?$|^${STORAGE_KEYS.SETTINGS}$`);
    /** @param {Record<string, chrome.storage.StorageChange>} changes */
    const listener = (changes) => {
      if (Object.keys(changes).some((key) => relevant.test(key))) callback();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      try {
        chrome.storage.onChanged.removeListener(listener);
      } catch {
        /* ignore */
      }
    };
  }
}