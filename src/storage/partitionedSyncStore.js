/**
 * Partitioned Sync Storage Engine.
 * Enforces data chunking/reassembly across synchronous browser sync limits
 * (chrome.storage.sync: 8,192 bytes per item). The `tabGroups` key holds the
 * partition manifest `{ partCount }`; payloads live in `tabGroups_part_{N}`.
 */
import { SAFE_CHUNK_BYTES } from '../shared/constants.js';

/**
 * @param {string} input
 * @param {number} size
 * @returns {string[]}
 */
function chunkString(input, size) {
  const parts = [];
  for (let offset = 0; offset < input.length; offset += size) {
    parts.push(input.slice(offset, offset + size));
  }
  return parts;
}

export class PartitionedSyncStore {
  /** @type {chrome.storage.StorageArea} */
  #area;
  /** @type {string} */
  #baseKey;

  /**
   * @param {chrome.storage.StorageArea} storageArea
   * @param {string} baseKey
   */
  constructor(storageArea, baseKey) {
    if (!storageArea || typeof storageArea.get !== 'function') {
      throw new Error('PartitionedSyncStore requires a chrome.storage StorageArea.');
    }
    this.#area = storageArea;
    this.#baseKey = baseKey;
  }

  /** @param {string} key @returns {string} */
  #partKey(index) {
    return `${this.#baseKey}_part_${index}`;
  }

  /** @param {string|string[]} key @returns {Promise<Record<string, *>>} */
  #get(key) {
    return new Promise((resolve, reject) => {
      this.#area.get(key, (items) => {
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

  /** @param {string|string[]} keys @returns {Promise<void>} */
  #remove(keys) {
    return new Promise((resolve, reject) => {
      this.#area.remove(keys, () => {
        const error = globalThis.chrome?.runtime?.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  }

  /**
   * Writes a serialized payload, partitioned as needed. Stale surplus parts
   * from previous larger payloads are removed to keep the sync budget clean.
   * @param {string} serialized JSON string
   */
  async write(serialized) {
    const parts = chunkString(serialized, SAFE_CHUNK_BYTES);

    const existing = await this.#get(this.#baseKey);
    const manifest = existing[this.#baseKey];
    const previousCount = manifest !== null && typeof manifest === 'object'
      && Number.isInteger(/** @type {Record<string, *>} */ (manifest).partCount)
      ? /** @type {Record<string, number>} */ (manifest).partCount
      : 0;

    /** @type {Record<string, string|object>} */
    const writes = {
      [this.#baseKey]: { partCount: parts.length, updatedAt: Date.now() },
    };
    parts.forEach((part, index) => {
      writes[this.#partKey(index)] = part;
    });

    await this.#set(writes);

    const staleKeys = [];
    for (let index = parts.length; index < previousCount; index += 1) {
      staleKeys.push(this.#partKey(index));
    }
    if (staleKeys.length > 0) {
      await this.#remove(staleKeys);
    }
  }

  /**
   * Reassembles the serialized payload. Returns null when the manifest is
   * absent (empty dataset) or when any partition is missing/unreadable
   * (caller falls back to migration/defaults).
   * @returns {Promise<string|null>}
   */
  async read() {
    const items = await this.#get(this.#baseKey);
    const manifest = items[this.#baseKey];
    if (manifest === null || typeof manifest !== 'object') return null;
    const partCount = /** @type {Record<string, *>} */ (manifest).partCount;
    if (!Number.isInteger(partCount) || partCount < 0) return null;
    if (partCount === 0) return '[]';

    const partKeys = [];
    for (let index = 0; index < partCount; index += 1) partKeys.push(this.#partKey(index));

    const parts = await this.#get(partKeys);
    let assembled = '';
    for (const key of partKeys) {
      const value = parts[key];
      if (typeof value !== 'string') return null;
      assembled += value;
    }
    return assembled;
  }

  /** Removes the manifest and every possible partition. */
  async clear() {
    const items = await this.#get(null);
    const keys = Object.keys(items).filter(
      (key) => key === this.#baseKey || key.startsWith(`${this.#baseKey}_part_`),
    );
    if (keys.length > 0) await this.#remove(keys);
  }
}