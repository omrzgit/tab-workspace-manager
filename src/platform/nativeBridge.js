/**
 * Native Platform Boundary.
 * The only module (popup-side) permitted to touch tabs/windows primitives.
 * Race-condition safeguards: optimistic lock pattern â€” missing tab IDs are
 * discarded silently during closure and window mutations.
 */
import { NEW_WINDOW_GEOMETRY } from '../shared/constants.js';
import { isAllowedLinkUri } from '../shared/sanitize.js';

/** @returns {Promise<chrome.windows.Window[]>} */
export function getAllWindows() {
  return chrome.windows.getAll({ populate: true });
}

/**
 * Captures the live window tree for the selection view.
 * @param {boolean} ignorePinnedTabs when true, pinned tabs are removed
 *        from the working collection (spec Flow 1.3).
 * @returns {Promise<Array<{ id: number, tabs: Array<{
 *   tabId: number, name: string, link: string, icon: string, pinned: boolean
 * }> }>>}
 */
export async function captureWindows(ignorePinnedTabs) {
  const windows = await getAllWindows();
  return windows
    .filter((win) => win.id !== undefined)
    .map((win) => {
      const tabs = (win.tabs ?? [])
        .filter((tab) => tab.id !== undefined)
        .filter((tab) => (ignorePinnedTabs ? tab.pinned !== true : true))
        .map((tab) => ({
          tabId: /** @type {number} */ (tab.id),
          name: tab.title ?? tab.url ?? 'Untitled',
          link: tab.url ?? '',
          icon: tab.favIconUrl ?? '',
          pinned: tab.pinned === true,
        }));
      return { id: /** @type {number} */ (win.id), tabs };
    })
    .filter((entry) => entry.tabs.length > 0);
}

/**
 * "Open in Current Window": iterates over the group's links, ignores
 * non-whitelisted URI schemes, and instantiates tabs sequentially.
 * @param {Array<{ link: string }>} links
 * @returns {Promise<number>} count of tabs actually created
 */
export async function openInCurrentWindow(links) {
  let created = 0;
  for (const { link } of links) {
    if (!isAllowedLinkUri(link)) continue;
    await chrome.tabs.create({ url: link, active: false }); // sequential
    created += 1;
  }
  return created;
}

/**
 * "Open in New Window": spawns an independent window (default geometry
 * 1024Ã—768), drops the initial empty tab, and instantiates the sanitized
 * link targets within the new context.
 * @param {Array<{ link: string }>} links
 * @returns {Promise<number>} count of tabs actually created
 */
export async function openInNewWindow(links) {
  const safeLinks = links.filter(({ link }) => isAllowedLinkUri(link));
  if (safeLinks.length === 0) return 0;

  const win = await chrome.windows.create({
    url: 'about:blank',
    width: NEW_WINDOW_GEOMETRY.width,
    height: NEW_WINDOW_GEOMETRY.height,
  });
  if (win.id === undefined) return 0;

  let created = 0;
  let index = 1; // keep slot 0 occupied by the initial tab until teardown
  for (const { link } of safeLinks) {
    await chrome.tabs.create({ windowId: win.id, index, url: link, active: false });
    index += 1;
    created += 1;
  }

  // Drop the initial empty tab; discard failure silently if it already closed.
  const initialTabId = win.tabs?.[0]?.id;
  if (initialTabId !== undefined) {
    await chrome.tabs.remove([initialTabId]).catch(() => {});
  }
  return created;
}

/**
 * Closes tabs matching saved IDs. Optimistic mutex: failures on missing IDs
 * are discarded silently (spec Â§4, "Race Conditions on Rapid Mutex Execution").
 * @param {number[]} tabIds
 */
export async function closeTabsSilently(tabIds) {
  if (tabIds.length === 0) return;
  try {
    await chrome.tabs.remove(tabIds);
  } catch {
    /* tab IDs ceased to exist before execution â€” intentionally discarded */
  }
}

/**
 * Opens a single sanitized link in a background tab of the current window.
 * @param {string} link
 */
export async function openSingleLink(link) {
  if (!isAllowedLinkUri(link)) return;
  await chrome.tabs.create({ url: link, active: true });
}

/**
 * Focuses the browser on an existing window.
 * @param {number} windowId
 */
export async function focusWindow(windowId) {
  await chrome.windows.update(windowId, { focused: true });
}