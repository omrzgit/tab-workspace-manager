/**
 * External Cloud Integration Layer.
 * Mediates remote backup transmission directly from the client to the
 * user-owned cloud storage repository (no middleman servers). Implements the
 * documented REST contract exactly:
 *   PUT /drive/v3/files/{fileId}?uploadType=media
 *   Authorization: Bearer <OAUTH2_TOKEN>
 *   Content-Type: application/json; charset=UTF-8
 *   Response: 200 OK
 */
import { REMOTE_BACKUP_FILENAME } from '../shared/constants.js';

const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3/files';
const LIST_BASE = 'https://www.googleapis.com/drive/v3/files';
const CREATE_BASE = 'https://www.googleapis.com/drive/v3/files';

export class DriveSyncClient {
  /** @returns {Promise<string|null>} null when the identity backend is unavailable. */
  async #getToken() {
    if (!globalThis.chrome?.identity?.getAuthToken) return null;
    try {
      return await new Promise((resolve) => {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (globalThis.chrome?.runtime?.lastError || !token) {
            resolve(null);
          } else {
            resolve(typeof token === 'object' ? token.token : token);
          }
        });
      });
    } catch {
      return null;
    }
  }

  /**
   * Locates the existing remote backup document, if any.
   * @param {string} token
   * @returns {Promise<string|null>}
   */
  async #findBackupFileId(token) {
    const query = `name = '${REMOTE_BACKUP_FILENAME}' and trashed = false`;
    const url = `${LIST_BASE}?spaces=drive&fields=files(id,name)&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const body = await response.json();
    const first = body?.files?.[0];
    return typeof first?.id === 'string' ? first.id : null;
  }

  /**
   * Executes the documented PUT upload contract. Resolves with the response
   * document on 200 OK; throws otherwise (caller queues a retry).
   * @param {Array<object>} groups serialized groups dataset
   * @returns {Promise<{ id: string, name: string, mimeType: string, modifiedTime: string }>}
   */
  async uploadBackup(groups) {
    const token = await this.#getToken();
    if (token === null) {
      throw new Error('Cloud sync unavailable: identity backend not configured.');
    }

    let fileId = await this.#findBackupFileId(token);
    if (fileId === null) {
      const createResponse = await fetch(`${CREATE_BASE}?fields=id`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({ name: REMOTE_BACKUP_FILENAME, mimeType: 'application/json' }),
      });
      if (!createResponse.ok) throw new Error(`Drive create failed: ${createResponse.status}`);
      fileId = /** @type {{ id: string }} */ (await createResponse.json()).id;
    }

    const uploadResponse = await fetch(
      `${UPLOAD_BASE}/${encodeURIComponent(fileId)}?uploadType=media`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({ tabGroups: groups }),
      },
    );
    if (!uploadResponse.ok) {
      throw new Error(`Drive upload failed: ${uploadResponse.status}`);
    }
    return uploadResponse.json();
  }
}