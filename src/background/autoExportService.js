/**
 * Auto Export Service (Background Daemon).
 * Automatically exports workspaces to JSON with conflictAction: 'overwrite'
 * to avoid duplicate files and minimize disk usage.
 */
import { AUTO_EXPORT_FILENAME } from '../shared/constants.js';
import { buildExportDocument } from '../shared/schemas.js';

export class AutoExportService {
  /** @type {import('../storage/workspaceRepository.js').WorkspaceRepository} */
  #repository;
  /** @type {ReturnType<typeof setTimeout>|null} */
  #debounceTimer = null;
  /** @type {boolean} */
  #isExporting = false;

  /** @param {import('../storage/workspaceRepository.js').WorkspaceRepository} repository */
  constructor(repository) {
    this.#repository = repository;
  }

  /**
   * Executes the download with conflictAction: 'overwrite'.
   */
  async exportNow() {
    if (this.#isExporting) return;
    if (!relativeChromeDownloads()) return;

    this.#isExporting = true;
    try {
      const groups = await this.#repository.loadGroups();
      const exportPayload = buildExportDocument(groups);
      const jsonString = JSON.stringify(exportPayload, null, 2);
      const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);

      await new Promise((resolve) => {
        chrome.downloads.download(
          {
            url: dataUrl,
            filename: AUTO_EXPORT_FILENAME,
            conflictAction: 'overwrite',
            saveAs: false,
          },
          (downloadId) => {
            if (globalThis.chrome?.runtime?.lastError) {
              console.warn('[AutoExportService] Download warning: ', globalThis.chrome.runtime.lastError.message);
            }
            resolve(downloadId);
          },
        );
      });
    } catch (err) {
      console.error('[AutoExportService] Export error: ', err);
    } finally {
      this.#isExporting = false;
    }
  }

  async handleTabOpened() {
    try {
      const settings = await this.#repository.loadSettings();
      if (!settings.autoExportJson) return;
      if (settings.autoExportTrigger !== 'tab_open' && settings.autoExportTrigger !== 'both') return;

      if (this.#debounceTimer !== null) clearTimeout(this.#debounceTimer);
      this.#debounceTimer = setTimeout(() => {
        this.#debounceTimer = null;
        void this.exportNow();
      }, 3000);
    } catch (err) {
      console.error('[AutoExportService] Tab-open handler error: ', err);
    }
  }

  async handleAlarmTrigger() {
    try {
      const settings = await this.#repository.loadSettings();
      if (!settings.autoExportJson) return;
      if (settings.autoExportTrigger !== 'timer' && settings.autoExportTrigger !== 'both') return;

      await this.exportNow();
    } catch (err) {
      console.error('[AutoExportService] Alarm handler error: ', err);
    }
  }
}

function relativeChromeDownloads() {
  return Boolean(globalThis.chrome?.downloads?.download);
}
