/**
 * Popup composition root + application controller.
 * Owns the UI State Machine and orchestrates every documented user flow
 * across the Saved Groups, Active Windows (Open Tabs), and Settings panels.
 * Presentation is fully delegated to the view modules.
 */
import {
  BUS_SOURCES,
  VALIDATION_MESSAGES,
} from '../shared/constants.js';
import {
  createReloadContextMenuMessage,
  isSessionCapturedMessage,
} from '../shared/messages.js';
import { validateGroupName } from '../shared/schemas.js';
import { isAllowedLinkUri, sanitizeLink, resolveGroupNameConflict } from '../shared/sanitize.js';
import { WorkspaceRepository } from '../storage/workspaceRepository.js';
import * as platform from '../platform/nativeBridge.js';
import { StateMachine, UiState } from './stateMachine.js';
import { exportGroupsToFile, mergeImportedGroups } from './sessionExchange.js';
import { renderSavedGroupsView } from './views/savedGroupsView.js';
import { renderActiveWindowsView } from './views/activeWindowsView.js';
import { renderSettingsView } from './views/settingsView.js';

const viewRoot = /** @type {HTMLElement} */ (document.getElementById('view-root'));
const searchInput = /** @type {HTMLInputElement} */ (document.getElementById('search-input'));
const addButton = /** @type {HTMLButtonElement} */ (document.getElementById('add-group-button'));
const headerSearch = /** @type {HTMLElement} */ (document.getElementById('header-search'));

class PopupController {
  /** @type {WorkspaceRepository} */
  #repository = new WorkspaceRepository();
  /** @type {StateMachine} */
  #fsm = new StateMachine();

  /** @type {Array<{ name: string, links: Array<object>, order: number }>} */
  #groups = [];
  /** @type {{ ignorePinnedTabs: boolean, closeTabsOnSaveGroup: boolean }} */
  #settings = { ignorePinnedTabs: true, closeTabsOnSaveGroup: false };
  /** @type {Array<{ id: number, tabs: Array<{ tabId: number, name: string, link: string, icon: string, pinned: boolean }> }>} */
  #capturedWindows = [];
  /** @type {Set<number>} */
  #selectedTabIds = new Set();
  /** @type {Map<number, number>} tabId â†’ captured window id */
  #tabWindowIndex = new Map();
  /** @type {number} */
  #collapsedWindowId = -1;
  /** @type {string} */
  #nameInput = '';
  /** @type {string} */
  #filter = '';
  /** @type {string|null} */
  #inlineError = null;
  /** @type {string|null} */
  #settingsStatus = null;
  /** @type {boolean} */
  #settingsStatusIsError = false;
  /** @type {(() => void)|null} */
  #unsubscribeStorage = null;

  async start() {
    this.#wireStateMachine();
    this.#wireChromeListeners();

    await this.#repository.init();
    this.#settings = await this.#repository.loadSettings();
    this.#unsubscribeStorage = this.#repository.subscribeToChanges(() => {
      void this.#reloadGroupsAndRender();
    });

    searchInput.addEventListener('input', () => {
      this.#filter = searchInput.value;
      this.#renderSavedGroups();
    });
    addButton.addEventListener('click', () => void this.#openCaptureFlow());

    await this.#reloadGroupsAndRender();
  }

  /**
   * Settings menu option selected (IDLE â†’ SETTINGS only, per the
   * documented transition table).
   */
  openSettings() {
    if (this.#fsm.state !== UiState.IDLE) return;
    this.#go(UiState.SETTINGS);
    this.#renderSettings();
  }

  #wireStateMachine() {
    this.#fsm.subscribe((state) => {
      const busy = state === UiState.MUTATING;
      addButton.disabled = busy
        || !(state === UiState.IDLE || state === UiState.SUCCESS);
      const showSearch = state === UiState.IDLE;
      headerSearch.classList.toggle('hidden', !showSearch);
      if (showSearch) searchInput.focus();
    });
  }

  #wireChromeListeners() {
    chrome.runtime.onMessage.addListener((message) => {
      if (isSessionCapturedMessage(message)) {
        void this.#reloadGroupsAndRender(); // background auto-save refresh
      }
      return false;
    });
  }

  async #reloadGroupsAndRender() {
    this.#groups = await this.#repository.loadGroups();
    this.#renderSavedGroups();
  }

  /**
   * State transition helper. Throws on illegal transitions (never expected;
   * logged defensively rather than crashing the popup).
   * @param {string} target
   */
  #go(target) {
    try {
      this.#fsm.transition(target);
    } catch (error) {
      console.error('[popup]', error);
    }
  }

  /* ---------------------- Flow 1: Capture ---------------------- */

  async #openCaptureFlow() {
    this.#go(UiState.ACTIVE_WINDOWS);
    this.#inlineError = null;
    this.#nameInput = '';
    this.#collapsedWindowId = -1;
    this.#capturedWindows = await platform.captureWindows(this.#settings.ignorePinnedTabs);
    this.#indexSelection();

    // The group name input receives focus; empty input keeps action disabled.
    this.#renderActiveWindows();
    document.getElementById('group-name-input')?.focus();
  }

  #indexSelection() {
    this.#selectedTabIds.clear();
    this.#tabWindowIndex.clear();
    for (const win of this.#capturedWindows) {
      for (const tab of win.tabs) {
        this.#tabWindowIndex.set(tab.tabId, win.id);
        this.#selectedTabIds.add(tab.tabId);
      }
    }
  }

  /** @param {number} tabId */
  #onTabToggle(tabId) {
    if (this.#selectedTabIds.has(tabId)) this.#selectedTabIds.delete(tabId);
    else this.#selectedTabIds.add(tabId);
    this.#syncSelectionState();
  }

  /** @param {number} windowId @param {boolean} checked */
  #onSelectAll(windowId, checked) {
    const win = this.#capturedWindows.find((entry) => entry.id === windowId);
    if (!win) return;
    for (const tab of win.tabs) {
      if (checked) this.#selectedTabIds.add(tab.tabId);
      else this.#selectedTabIds.delete(tab.tabId);
    }
    this.#syncSelectionState();
  }

  /** Recalculates the multi-select state (spec: SELECTION_DIRTY side effects). */
  #syncSelectionState() {
    if (this.#selectedTabIds.size > 0) {
      if (this.#fsm.state === UiState.ACTIVE_WINDOWS) this.#go(UiState.SELECTION_DIRTY);
    } else if (this.#fsm.state === UiState.SELECTION_DIRTY) {
      this.#go(UiState.ACTIVE_WINDOWS);
    }
    this.#renderActiveWindows();
  }

  #renderActiveWindows() {
    renderActiveWindowsView(viewRoot, {
      windows: this.#capturedWindows,
      selectedTabIds: this.#selectedTabIds,
      collapsedWindowId: this.#collapsedWindowId,
      nameInput: this.#nameInput,
      saveDisabled: this.#nameInput.trim().length === 0 || this.#selectedTabIds.size === 0 || this.#fsm.state === UiState.MUTATING,
      inlineError: this.#inlineError,
    }, {
      onTabToggle: (tabId) => this.#onTabToggle(tabId),
      onSelectAll: (windowId, checked) => this.#onSelectAll(windowId, checked),
      onToggleCollapse: (windowId) => {
        this.#collapsedWindowId = this.#collapsedWindowId === windowId ? -1 : windowId;
        this.#renderActiveWindows();
      },
      onNameInput: (value) => {
        this.#nameInput = value;
        if (this.#inlineError) this.#inlineError = null;
        // In-place update: does NOT call #renderActiveWindows() to keep typing focus intact!
      },
      onSave: () => void this.#commitCapture(),
      onSaveAllSeparately: () => void this.#saveAllWindowsSeparately(),
      onSaveWindowDirect: (windowId) => void this.#saveWindowDirect(windowId),
      onCancel: () => {
        this.#selectedTabIds.clear();
        this.#capturedWindows = [];
        this.#go(UiState.IDLE);
        void this.#reloadGroupsAndRender();
      },
    });
  }

  /**
   * Saves each open window as its own separate workspace session.
   */
  async #saveAllWindowsSeparately() {
    this.#go(UiState.MUTATING);
    try {
      if (this.#capturedWindows.length === 0) {
        throw new Error('No capturable open windows found.');
      }
      const existingNames = new Set(this.#groups.map((g) => g.name));
      const allSavedTabIds = [];
      let savedCount = 0;

      for (let i = 0; i < this.#capturedWindows.length; i++) {
        const win = this.#capturedWindows[i];
        const links = [];
        const winTabIds = [];
        for (const tab of win.tabs) {
          const safe = sanitizeLink(
            { id: tab.tabId, name: tab.name, link: tab.link, icon: tab.icon },
            links.length,
          );
          if (safe) {
            links.push(safe);
            winTabIds.push(tab.tabId);
          }
        }
        if (links.length === 0) continue;

        let baseName = `Window ${i + 1}`;
        try {
          const domain = new URL(links[0].link).hostname.replace(/^www\./, '');
          if (domain) baseName = `Window ${i + 1} (${domain})`;
        } catch {
          /* fallback to Window i + 1 */
        }

        const uniqueName = resolveGroupNameConflict(baseName, existingNames);
        existingNames.add(uniqueName);

        this.#groups.push({ name: uniqueName, links, order: this.#groups.length });
        allSavedTabIds.push(...winTabIds);
        savedCount++;
      }

      if (savedCount === 0) {
        throw new Error('No valid tabs found to save.');
      }

      await this.#repository.saveGroups(this.#groups);
      this.#notifyContextMenuReload();

      if (this.#settings.closeTabsOnSaveGroup) {
        await platform.closeTabsSilently(allSavedTabIds);
      }

      this.#go(UiState.SUCCESS);
      this.#finalizeSuccess();
    } catch (error) {
      this.#enterError(error instanceof Error ? error.message : 'Failed to save windows.');
    }
  }

  /**
   * Saves an individual window directly into a workspace.
   * @param {number} windowId
   */
  async #saveWindowDirect(windowId) {
    this.#go(UiState.MUTATING);
    try {
      const win = this.#capturedWindows.find((entry) => entry.id === windowId);
      if (!win) throw new Error('Window not found.');
      const links = [];
      const savedTabIds = [];
      for (const tab of win.tabs) {
        const safe = sanitizeLink(
          { id: tab.tabId, name: tab.name, link: tab.link, icon: tab.icon },
          links.length,
        );
        if (safe) {
          links.push(safe);
          savedTabIds.push(tab.tabId);
        }
      }
      if (links.length === 0) {
        throw new Error('No valid tabs in this window.');
      }

      let baseName = `Window ${win.id}`;
      try {
        const domain = new URL(links[0].link).hostname.replace(/^www\./, '');
        if (domain) baseName = `${domain} (Window ${win.id})`;
      } catch {
        /* fallback */
      }

      const existingNames = new Set(this.#groups.map((g) => g.name));
      const uniqueName = resolveGroupNameConflict(baseName, existingNames);

      this.#groups.push({ name: uniqueName, links, order: this.#groups.length });
      await this.#repository.saveGroups(this.#groups);
      this.#notifyContextMenuReload();

      if (this.#settings.closeTabsOnSaveGroup) {
        await platform.closeTabsSilently(savedTabIds);
      }

      this.#go(UiState.SUCCESS);
      this.#finalizeSuccess();
    } catch (error) {
      this.#enterError(error instanceof Error ? error.message : 'Failed to save window.');
    }
  }

  /** Spec Flow 1, steps 7â€“10. */
  async #commitCapture() {
    this.#go(UiState.MUTATING);
    try {
      const validation = validateGroupName(this.#nameInput);
      if (!validation.ok) throw new Error(validation.error);

      const existingNames = new Set(this.#groups.map((group) => group.name));
      if (existingNames.has(validation.value)) {
        throw new Error(VALIDATION_MESSAGES.NAME_DUPLICATE);
      }

      const links = [];
      const savedTabIds = [];
      for (const win of this.#capturedWindows) {
        for (const tab of win.tabs) {
          if (!this.#selectedTabIds.has(tab.tabId)) continue;
          const safe = sanitizeLink(
            { id: tab.tabId, name: tab.name, link: tab.link, icon: tab.icon },
            links.length,
          );
          if (safe) {
            links.push(safe);
            savedTabIds.push(tab.tabId);
          }
        }
      }
      if (links.length === 0) {
        throw new Error('Select at least one tab with a valid address to save.');
      }

      this.#groups.push({ name: validation.value, links, order: this.#groups.length });
      await this.#repository.saveGroups(this.#groups);
      this.#notifyContextMenuReload();

      if (this.#settings.closeTabsOnSaveGroup) {
        await platform.closeTabsSilently(savedTabIds); // silent discard on race
      }

      this.#go(UiState.SUCCESS);
      this.#finalizeSuccess();
    } catch (error) {
      this.#enterError(error instanceof Error ? error.message : 'Unknown failure.');
    }
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Flow 2: Bulk Workspace Restoration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  /** @param {string} name @param {'current'|'new'} mode */
  async #restoreGroup(name, mode) {
    this.#go(UiState.MUTATING);
    try {
      const group = this.#groups.find((entry) => entry.name === name);
      if (!group) throw new Error('Workspace no longer exists.');
      const count = mode === 'new'
        ? await platform.openInNewWindow(group.links)
        : await platform.openInCurrentWindow(group.links);
      if (count === 0) {
        throw new Error('No links in this workspace have a safe address scheme.');
      }
      this.#go(UiState.SUCCESS);
      this.#finalizeSuccess();
    } catch (error) {
      this.#enterError(error instanceof Error ? error.message : 'Restore failed.');
    }
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Flow 3: JSON Import Merge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  /** @param {File} file */
  async #importFromFile(file) {
    this.#go(UiState.MUTATING);
    try {
      const rawText = await file.text();
      const merged = mergeImportedGroups(rawText, this.#groups); // halts on corruption
      await this.#repository.saveGroups(merged);
      this.#groups = merged;
      this.#notifyContextMenuReload();
      this.#go(UiState.SUCCESS);
      this.#finalizeSuccess();
    } catch (error) {
      this.#enterError(error instanceof Error ? error.message : 'Import failed.');
    }
  }

  /* ---------------------- Settings / Mutations / Exchange ---------------------- */

  /**
   * @param {'ignorePinnedTabs'|'closeTabsOnSaveGroup'} key
   * @param {boolean} value
   */
  async #toggleSetting(key, value) {
    this.#go(UiState.MUTATING);
    try {
      this.#settings = await this.#repository.saveSettings({ [key]: value });
      this.#settingsStatus = 'Settings saved.';
      this.#settingsStatusIsError = false;
      this.#go(UiState.SUCCESS);
      this.#go(UiState.SETTINGS);
      this.#renderSettings();
    } catch (error) {
      this.#settingsStatus = error instanceof Error ? error.message : 'Settings failure.';
      this.#settingsStatusIsError = true;
      this.#go(UiState.ERROR);
      this.#renderSettings();
    }
  }

  /** @param {string} name @param {-1|1} direction */
  async #reorderGroup(name, direction) {
    this.#go(UiState.MUTATING);
    try {
      const index = this.#groups.findIndex((group) => group.name === name);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= this.#groups.length) {
        throw new Error('Reorder out of bounds.');
      }
      [this.#groups[index], this.#groups[target]] = [this.#groups[target], this.#groups[index]];
      this.#renormalizeOrders();
      await this.#repository.saveGroups(this.#groups);
      this.#notifyContextMenuReload();
      this.#go(UiState.SUCCESS);
      this.#finalizeSuccess();
    } catch (error) {
      this.#enterError(error instanceof Error ? error.message : 'Reorder failed.');
    }
  }

  #renormalizeOrders() {
    this.#groups.forEach((group, index) => {
      group.order = index;
    });
  }

  /** @param {string} oldName */
  #beginRename(oldName) {
    const next = window.prompt('New workspace name:', oldName);
    if (next === null) return;
    void this.#commitRename(oldName, next);
  }

  /** @param {string} oldName @param {string} rawName */
  async #commitRename(oldName, rawName) {
    this.#go(UiState.MUTATING);
    try {
      const validation = validateGroupName(rawName);
      if (!validation.ok) throw new Error(validation.error);
      if (this.#groups.some((group) => group.name === validation.value && group.name !== oldName)) {
        throw new Error(VALIDATION_MESSAGES.NAME_DUPLICATE);
      }
      const group = this.#groups.find((entry) => entry.name === oldName);
      if (!group) throw new Error('Workspace no longer exists.');
      group.name = validation.value;
      await this.#repository.saveGroups(this.#groups);
      this.#notifyContextMenuReload();
      this.#go(UiState.SUCCESS);
      this.#finalizeSuccess();
    } catch (error) {
      this.#enterError(error instanceof Error ? error.message : 'Rename failed.');
    }
  }

  /** @param {string} name */
  #beginDelete(name) {
    if (!window.confirm(`Delete workspace "${name}"? This cannot be undone.`)) return;
    void this.#commitDelete(name);
  }

  /** @param {string} name */
  async #commitDelete(name) {
    this.#go(UiState.MUTATING);
    try {
      this.#groups = this.#groups.filter((group) => group.name !== name);
      this.#renormalizeOrders();
      await this.#repository.saveGroups(this.#groups);
      this.#notifyContextMenuReload();
      this.#go(UiState.SUCCESS);
      this.#finalizeSuccess();
    } catch (error) {
      this.#enterError(error instanceof Error ? error.message : 'Delete failed.');
    }
  }

  #exportAll() {
    exportGroupsToFile(this.#groups); // TabGroup_{EPOCH_TIMESTAMP}.json
  }

  /** @param {string} groupName @param {string} link */
  #openLink(groupName, link) {
    if (!isAllowedLinkUri(link)) return; // non-whitelisted schemes are disabled
    void platform.openSingleLink(link);
  }

  /* ---------------------- Rendering & error paths ---------------------- */

  #renderSavedGroups() {
    if (this.#fsm.state !== UiState.IDLE) return;
    renderSavedGroupsView(viewRoot, { groups: this.#groups, filter: this.#filter }, {
      onOpenCurrentWindow: (name) => void this.#restoreGroup(name, 'current'),
      onOpenNewWindow: (name) => void this.#restoreGroup(name, 'new'),
      onOpenLink: (groupName, link) => this.#openLink(groupName, link),
      onReorder: (name, direction) => void this.#reorderGroup(name, direction),
      onRename: (name) => this.#beginRename(name),
      onDelete: (name) => this.#beginDelete(name),
    });
  }

  #renderSettings() {
    renderSettingsView(viewRoot, {
      settings: this.#settings,
      statusMessage: this.#settingsStatus,
      statusIsError: this.#settingsStatusIsError,
    }, {
      onToggle: (key, value) => void this.#toggleSetting(key, value),
      onExport: () => this.#exportAll(),
      onImportFile: (file) => void this.#importFromFile(file),
      onSyncDriveNow: () => void this.#syncDriveNow(),
      onBack: () => {
        this.#settingsStatus = null;
        this.#go(UiState.IDLE);
        void this.#reloadGroupsAndRender();
      },
    });
  }

  async #syncDriveNow() {
    this.#settingsStatus = 'Uploading backup to Google Drive...';
    this.#settingsStatusIsError = false;
    this.#renderSettings();

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'SYNC_DRIVE_NOW' }, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(res);
          }
        });
      });
      if (response && response.ok) {
        const timeStr = new Date(response.timestamp).toLocaleTimeString();
        this.#settingsStatus = `Google Drive backup succeeded at ${timeStr}.`;
        this.#settingsStatusIsError = false;
      } else {
        throw new Error(response?.error || 'Drive sync failed.');
      }
    } catch (err) {
      this.#settingsStatus = err instanceof Error ? err.message : 'Drive sync failed.';
      this.#settingsStatusIsError = true;
    }
    this.#renderSettings();
  }

  cancelActiveFlow() {
    if (this.#fsm.state === UiState.ACTIVE_WINDOWS || this.#fsm.state === UiState.SELECTION_DIRTY) {
      this.#selectedTabIds.clear();
      this.#capturedWindows = [];
      this.#go(UiState.IDLE);
      void this.#reloadGroupsAndRender();
    } else if (this.#fsm.state === UiState.SETTINGS) {
      this.#settingsStatus = null;
      this.#go(UiState.IDLE);
      void this.#reloadGroupsAndRender();
    } else if (this.#fsm.state === UiState.ERROR) {
      this.#inlineError = null;
      this.#go(UiState.IDLE);
      void this.#reloadGroupsAndRender();
    }
  }

  /**
   * ERROR side effect: surfaces the message without clearing active view
   * states; the user may dismiss back to IDLE.
   * @param {string} message
   */
  #enterError(message) {
    this.#inlineError = message;
    this.#go(UiState.ERROR);
    if (this.#capturedWindows.length > 0) {
      this.#renderActiveWindows(); // inline validation, capture flow preserved
    } else {
      this.#renderFatalError(message);
    }
  }

  /** @param {string} message */
  #renderFatalError(message) {
    viewRoot.replaceChildren();
    const box = document.createElement('div');
    box.className = 'error-box';
    const text = document.createElement('p');
    text.setAttribute('role', 'alert');
    text.textContent = message;
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'btn primary';
    dismiss.textContent = 'Dismiss';
    dismiss.addEventListener('click', () => {
      this.#inlineError = null;
      this.#go(UiState.IDLE);
      void this.#reloadGroupsAndRender();
    });
    box.append(text, dismiss);
    viewRoot.append(box);
  }

  /** SUCCESS side effect: refresh DOM, flush memory forms, back to IDLE. */
  #finalizeSuccess() {
    this.#selectedTabIds.clear();
    this.#capturedWindows = [];
    this.#nameInput = '';
    this.#inlineError = null;
    this.#go(UiState.IDLE);
    void this.#reloadGroupsAndRender();
  }

  /** Context Menu Invalidation: UI Layer -> Background Worker. */
  #notifyContextMenuReload() {
    chrome.runtime
      .sendMessage(createReloadContextMenuMessage(BUS_SOURCES.POPUP_MUTATION))
      .catch(() => {});
  }
}

const controller = new PopupController();
void controller.start();

// IDLE -> SETTINGS via the header gear control.
document.getElementById('settings-button')?.addEventListener('click', () => {
  controller.openSettings();
});

// Global keyboard shortcuts (Esc to cancel active modal/flow)
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    controller.cancelActiveFlow();
  }
});