/**
 * Background Service Worker entry point (MV3, event-driven daemon).
 * Owns: Context Menu Manager, Window Lifecycle Observer, Remote Backup Queue,
 * and the background half of the internal message bus.
 */
import { ALARM_NAMES } from '../shared/constants.js';
import { isReloadContextMenuMessage } from '../shared/messages.js';
import { WorkspaceRepository } from '../storage/workspaceRepository.js';
import { DriveSyncClient } from '../cloud/driveSyncClient.js';
import { RemoteBackupQueue } from './remoteBackupQueue.js';
import { ContextMenuManager } from './contextMenuManager.js';
import { WindowLifecycleObserver } from './windowLifecycleObserver.js';
import { AutoExportService } from './autoExportService.js';

const repository = new WorkspaceRepository();
const driveClient = new DriveSyncClient();
const backupQueue = new RemoteBackupQueue(driveClient);
const contextMenus = new ContextMenuManager(repository);
const lifecycleObserver = new WindowLifecycleObserver(repository, backupQueue);
const autoExportService = new AutoExportService(repository);

lifecycleObserver.attach();

/**
 * Syncs background alarms according to current settings.
 */
async function syncAlarms() {
  if (!globalThis.chrome?.alarms) return;
  try {
    const settings = await repository.loadSettings();

    // Auto-export alarm
    if (settings.autoExportJson && (settings.autoExportTrigger === 'timer' || settings.autoExportTrigger === 'both')) {
      const period = Math.max(1, settings.autoExportTimerMinutes || 15);
      chrome.alarms.create(ALARM_NAMES.AUTO_EXPORT, { periodInMinutes: period });
    } else {
      chrome.alarms.clear(ALARM_NAMES.AUTO_EXPORT);
    }

    // Periodic Drive backup alarm
    if (settings.periodicDriveBackup) {
      const period = Math.max(1, settings.periodicDriveBackupMinutes || 30);
      chrome.alarms.create(ALARM_NAMES.PERIODIC_DRIVE, { periodInMinutes: period });
    } else {
      chrome.alarms.clear(ALARM_NAMES.PERIODIC_DRIVE);
    }
  } catch (error) {
    console.error('[TabWorkspaceManager] syncAlarms error:', error);
  }
}

/**
 * Boot sequence: migrate storage on cold launch, then rebuild dynamic context menus & alarms.
 */
async function bootstrap() {
  try {
    await repository.init();
    await contextMenus.rebuild();
    await syncAlarms();
  } catch (error) {
    console.error('[TabWorkspaceManager] bootstrap failure:', error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void bootstrap();
});

chrome.runtime.onStartup.addListener(() => {
  void bootstrap();
});

// Periodic alarms listener
if (globalThis.chrome?.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAMES.AUTO_EXPORT) {
      void autoExportService.handleAlarmTrigger();
    } else if (alarm.name === ALARM_NAMES.PERIODIC_DRIVE) {
      void repository.loadGroups().then((groups) => backupQueue.enqueue(groups));
    }
  });
}

// Auto-export on tab creation
if (globalThis.chrome?.tabs?.onCreated) {
  chrome.tabs.onCreated.addListener(() => {
    void autoExportService.handleTabOpened();
  });
}

// Watch settings updates to re-synchronize alarms
repository.subscribeToChanges(() => {
  void syncAlarms();
});

// Internal Message Bus — background half.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isReloadContextMenuMessage(message)) {
    void contextMenus.rebuild();
    return false;
  }
  if (message && typeof message === 'object' && message.action === 'SYNC_DRIVE_NOW') {
    (async () => {
      try {
        const groups = await repository.loadGroups();
        await driveClient.uploadBackup(groups);
        sendResponse({ ok: true, timestamp: Date.now() });
      } catch (err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true; // async sendResponse
  }
  return false;
});

chrome.contextMenus.onClicked.addListener((info) => {
  void contextMenus.handleClick(info);
});

void bootstrap();