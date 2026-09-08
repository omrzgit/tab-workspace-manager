/**
 * Window Lifecycle Observer (Auto-Save on Close).
 * Headless event-driven automation: when a browser window terminates, its
 * cached tab tree is captured, persisted as
 * "Auto-Save (Window Close)" (conflict-resolved), a SESSION_CAPTURED_EVENT is
 * broadcast, and an asynchronous remote backup is queued (non-blocking).
 */
import { AUTO_SAVE_GROUP_NAME } from '../shared/constants.js';
import { resolveGroupNameConflict, sanitizeLink } from '../shared/sanitize.js';
import { createSessionCapturedEvent } from '../shared/messages.js';

export class WindowLifecycleObserver {
  /** @type {import('../storage/workspaceRepository.js').WorkspaceRepository} */
  #repository;
  /** @type {import('./remoteBackupQueue.js').RemoteBackupQueue} */
  #backupQueue;
  /** @type {Map<number, Array<{ tabId: number, name: string, link: string, icon: string, pinned: boolean }>>} */
  #registry = new Map();
  /** @type {boolean} */
  #refreshQueued = false;

  /**
   * @param {import('../storage/workspaceRepository.js').WorkspaceRepository} repository
   * @param {import('./remoteBackupQueue.js').RemoteBackupQueue} backupQueue
   */
  constructor(repository, backupQueue) {
    this.#repository = repository;
    this.#backupQueue = backupQueue;
  }

  attach() {
    chrome.windows.onRemoved.addListener((windowId) => {
      void this.#handleWindowRemoved(windowId);
    });

    const schedule = () => this.#scheduleSnapshot();
    chrome.tabs.onCreated.addListener(schedule);
    chrome.tabs.onUpdated.addListener(schedule);
    chrome.tabs.onRemoved.addListener(schedule);
    chrome.tabs.onMoved.addListener(schedule);
    chrome.tabs.onAttached.addListener(schedule);
    chrome.tabs.onDetached.addListener(schedule);
    chrome.windows.onCreated.addListener(schedule);

    void this.#snapshotAllWindows();
  }

  /** Coalesces burst events into a single registry rebuild. */
  #scheduleSnapshot() {
    if (this.#refreshQueued) return;
    this.#refreshQueued = true;
    setTimeout(() => {
      this.#refreshQueued = false;
      void this.#snapshotAllWindows();
    }, 150);
  }

  async #snapshotAllWindows() {
    try {
      const windows = await chrome.windows.getAll({ populate: true });
      /** @type {Map<number, *>} */
      const next = new Map();
      for (const win of windows) {
        if (win.id === undefined) continue;
        next.set(win.id, (win.tabs ?? [])
          .filter((tab) => tab.id !== undefined)
          .map((tab) => ({
            tabId: /** @type {number} */ (tab.id),
            name: tab.title ?? tab.url ?? 'Untitled',
            link: tab.url ?? '',
            icon: tab.favIconUrl ?? '',
            pinned: tab.pinned === true,
          })));
      }
      this.#registry = next;
    } catch {
      /* transient runtime shutdown â€” next event re-snapshots */
    }
  }

  /** @param {number} windowId */
  async #handleWindowRemoved(windowId) {
    // Read the cached tree BEFORE refreshing the registry (window already gone).
    const cachedTabs = this.#registry.get(windowId) ?? [];
    await this.#snapshotAllWindows();

    if (cachedTabs.length === 0) return;

    const settings = await this.#repository.loadSettings();
    const workingTabs = cachedTabs.filter(
      (tab) => (settings.ignorePinnedTabs ? !tab.pinned : true),
    );

    const links = [];
    for (const tab of workingTabs) {
      const safe = sanitizeLink(
        { name: tab.name, link: tab.link, icon: tab.icon },
        links.length,
      );
      if (safe) links.push(safe);
    }
    if (links.length === 0) return;

    const capturedAt = Date.now();
    const groups = await this.#repository.loadGroups();
    const groupName = resolveGroupNameConflict(
      AUTO_SAVE_GROUP_NAME,
      new Set(groups.map((group) => group.name)),
    );
    groups.push({ name: groupName, links, order: groups.length });
    await this.#repository.saveGroups(groups);

    // Broadcast to any live UI context; absence of receivers is normal.
    const message = createSessionCapturedEvent({ groupName, capturedAt, links });
    chrome.runtime.sendMessage(message).catch(() => {});

    // Asynchronous remote mirror â€” never blocks the local persistence path.
    this.#backupQueue.enqueue(groups);
  }
}