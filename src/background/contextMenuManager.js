/**
 * Context Menu Manager.
 * Creates and reloads context menu entries dynamically, mirroring the current
 * saved-groups collection. Invalidated via RELOAD_CONTEXT_MENU bus events.
 */
import { openInCurrentWindow, openInNewWindow } from '../platform/nativeBridge.js';

const ROOT_ID = 'twm-root';

export class ContextMenuManager {
  /** @type {import('../storage/workspaceRepository.js').WorkspaceRepository} */
  #repository;

  /** @param {import('../storage/workspaceRepository.js').WorkspaceRepository} repository */
  constructor(repository) {
    this.#repository = repository;
  }

  /**
   * Rebuilds the contextual menu from persisted groups.
   * Synchronous-fire creation callbacks honor chrome.runtime.lastError.
   */
  async rebuild() {
    if (!globalThis.chrome?.contextMenus?.removeAll) return;
    await chrome.contextMenus.removeAll();

    /** @param {chrome.contextMenus.CreateProperties} properties */
    const create = (properties) => {
      chrome.contextMenus.create(properties, () => void globalThis.chrome?.runtime?.lastError);
    };

    create({
      id: ROOT_ID,
      title: 'Open workspace...',
      contexts: ['action'],
    });

    const groups = await this.#repository.loadGroups();
    for (const group of groups) {
      const key = encodeURIComponent(group.name);
      create({
        id: `twm:new:${key}`,
        parentId: ROOT_ID,
        title: `"${group.name}" in new window`,
        contexts: ['action'],
      });
      create({
        id: `twm:current:${key}`,
        parentId: ROOT_ID,
        title: `"${group.name}" in current window`,
        contexts: ['action'],
      });
    }
  }

  /**
   * Dispatches a context-menu click to the restore flow.
   * @param {chrome.contextMenus.OnClickData} info
   */
  async handleClick(info) {
    const menuItemId = String(info.menuItemId ?? '');
    const separator = menuItemId.indexOf(':');
    if (separator === -1) return;
    const mode = menuItemId.slice(separator + 1, menuItemId.indexOf(':', separator + 1));
    if (!['new', 'current'].includes(mode)) return;

    const name = decodeURIComponent(menuItemId.slice(menuItemId.indexOf(':', separator + 1) + 1));
    const groups = await this.#repository.loadGroups();
    const group = groups.find((candidate) => candidate.name === name);
    if (!group) return;

    if (mode === 'new') await openInNewWindow(group.links);
    else if (mode === 'current') await openInCurrentWindow(group.links);
  }
}