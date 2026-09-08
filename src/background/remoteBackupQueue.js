/**
 * Remote backup retry queue (spec Â§4, "Offline Operation").
 * Remote backups operate asynchronously; failure to reach external storage
 * backends queues a retry without blocking local session actions.
 */
import { REMOTE_BACKUP_RETRY_MS } from '../shared/constants.js';

export class RemoteBackupQueue {
  /** @type {import('../cloud/driveSyncClient.js').DriveSyncClient} */
  #client;
  /** @type {Array<object>|null} */
  #pending = null;
  /** @type {boolean} */
  #inFlight = false;
  /** @type {ReturnType<typeof setTimeout>|null} */
  #timer = null;

  /** @param {import('../cloud/driveSyncClient.js').DriveSyncClient} client */
  constructor(client) {
    this.#client = client;
  }

  /**
   * Enqueues the latest dataset snapshot. Only one attempt runs at a time;
   * the newest snapshot always wins.
   * @param {Array<object>} groups
   */
  enqueue(groups) {
    this.#pending = groups;
    if (this.#inFlight || this.#timer !== null) return;
    this.#attempt();
  }

  async #attempt() {
    const snapshot = this.#pending;
    if (snapshot === null) return;
    this.#inFlight = true;
    this.#pending = null;
    try {
      await this.#client.uploadBackup(snapshot);
    } catch {
      // Non-blocking failure: schedule a retry; local session actions continue.
      this.#timer = setTimeout(() => {
        this.#timer = null;
        this.#attempt();
      }, REMOTE_BACKUP_RETRY_MS);
    } finally {
      this.#inFlight = false;
      if (this.#pending !== null && this.#timer === null) this.#attempt();
    }
  }
}