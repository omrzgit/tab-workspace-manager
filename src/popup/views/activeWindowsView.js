/**
 * Active Windows View — capture/selection tree.
 * Windows render as collapsible modules; preview favicon collections display
 * the first 7 links per window.
 */
import { FAVICON_PREVIEW_LIMIT } from '../../shared/constants.js';
import { isAllowedIconUri } from '../../shared/sanitize.js';

/**
 * Creates a clean SVG fallback favicon when a site icon is missing or fails to load.
 * @returns {HTMLElement}
 */
export function buildFallbackFavicon() {
  const span = document.createElement('span');
  span.className = 'favicon favicon-fallback';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm5.7 7H10.6A11.7 11.7 0 0 0 9.7 2.4 6.5 6.5 0 0 1 13.7 7zM8 1.5c.7 1.3 1.3 3.3 1.5 5.5H6.5c.2-2.2.8-4.2 1.5-5.5zM2.3 9h3.1c.1 2 .7 3.9 1.5 5.4A6.5 6.5 0 0 1 2.3 9zm3.1-2H2.3a6.5 6.5 0 0 1 4-4.6c-.8 1.5-1.4 3.4-1.5 4.6zM8 14.5c-.7-1.3-1.3-3.3-1.5-5.5h3c-.2 2.2-.8 4.2-1.5 5.5zm1.7-6.5H6.3C6.4 6.2 7.1 4.5 8 4.5s1.6 1.7 1.7 3.5zm.9 6.4c.8-1.5 1.4-3.4 1.5-5.4h3.1a6.5 6.5 0 0 1-4.6 5.4z"/></svg>`;
  return span;
}

/**
 * @param {string} icon
 * @returns {HTMLElement}
 */
function previewFavicon(icon) {
  if (isAllowedIconUri(icon)) {
    const img = document.createElement('img');
    img.className = 'favicon';
    img.src = icon;
    img.alt = '';
    img.addEventListener('error', () => {
      const fallback = buildFallbackFavicon();
      img.replaceWith(fallback);
    }, { once: true });
    return img;
  }
  return buildFallbackFavicon();
}

/**
 * @param {HTMLElement} container
 * @param {object} model
 * @param {Array<{ id: number, tabs: Array<{ tabId: number, name: string, link: string, icon: string, pinned: boolean }> }>} model.windows
 * @param {Set<number>} model.selectedTabIds
 * @param {number} model.collapsedWindowId window currently collapsed, or -1
 * @param {string} model.nameInput current group-name field value
 * @param {boolean} model.saveDisabled
 * @param {string|null} model.inlineError inline validation message
 * @param {object} handlers
 * @param {(tabId: number) => void} handlers.onTabToggle
 * @param {(windowId: number, checked: boolean) => void} handlers.onSelectAll
 * @param {(windowId: number) => void} handlers.onToggleCollapse
 * @param {(value: string) => void} handlers.onNameInput
 * @param {() => void} handlers.onSave
 * @param {() => void} handlers.onSaveAllSeparately
 * @param {(windowId: number) => void} handlers.onSaveWindowDirect
 * @param {() => void} handlers.onCancel
 */
export function renderActiveWindowsView(container, model, handlers) {
  container.replaceChildren();

  const panel = document.createElement('form');
  panel.className = 'capture-panel';
  panel.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!save.disabled) {
      handlers.onSave();
    }
  });

  const nameRow = document.createElement('div');
  nameRow.className = 'name-row';
  const label = document.createElement('label');
  label.htmlFor = 'group-name-input';
  label.textContent = 'Workspace Name';

  const input = document.createElement('input');
  input.id = 'group-name-input';
  input.type = 'text';
  input.maxLength = 90;
  input.placeholder = 'e.g. Research Session, Morning Tabs...';
  input.value = model.nameInput;
  input.autocomplete = 'off';

  const errorSlot = document.createElement('p');
  errorSlot.className = 'inline-error';
  errorSlot.setAttribute('role', 'alert');

  const controls = document.createElement('div');
  controls.className = 'capture-controls';

  const saveAllSeparately = document.createElement('button');
  saveAllSeparately.type = 'button';
  saveAllSeparately.className = 'btn';
  saveAllSeparately.title = 'Save each open window into its own separate workspace';
  saveAllSeparately.textContent = '⚡ Save Each Window Separately';
  saveAllSeparately.addEventListener('click', () => handlers.onSaveAllSeparately());

  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'btn primary';
  save.textContent = 'Save Group';
  save.disabled = model.saveDisabled;

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn subtle';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', handlers.onCancel);

  // In-place input handler: NEVER re-renders form on keystroke, preventing focus loss
  input.addEventListener('input', () => {
    handlers.onNameInput(input.value);
    if (errorSlot.parentNode) errorSlot.remove();
    save.disabled = input.value.trim().length === 0 || model.selectedTabIds.size === 0;
  });

  nameRow.append(label, input);

  if (model.inlineError) {
    errorSlot.textContent = model.inlineError;
    panel.append(nameRow, errorSlot);
  } else {
    panel.append(nameRow);
  }

  controls.append(saveAllSeparately, save, cancel);

  if (model.windows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No capturable windows open.';
    panel.append(empty, controls);
    container.append(panel);
    return;
  }

  for (const win of model.windows) {
    const module = document.createElement('fieldset');
    module.className = 'window-module';

    const legend = document.createElement('legend');
    const selectAll = document.createElement('input');
    selectAll.type = 'checkbox';
    selectAll.title = 'Select all tabs in this window';
    const allSelected = win.tabs.every((tab) => model.selectedTabIds.has(tab.tabId));
    selectAll.checked = allSelected;
    selectAll.addEventListener('change', (e) => {
      e.stopPropagation();
      handlers.onSelectAll(win.id, selectAll.checked);
    });

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn subtle collapse-toggle';
    toggle.title = 'Toggle collapse';
    toggle.textContent = model.collapsedWindowId === win.id ? '▸' : '▾';
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handlers.onToggleCollapse(win.id);
    });

    const title = document.createElement('span');
    title.className = 'window-title';
    title.textContent = `Window ${win.id} · ${win.tabs.length} tabs`;

    const quickSaveWin = document.createElement('button');
    quickSaveWin.type = 'button';
    quickSaveWin.className = 'btn subtle quick-window-btn';
    quickSaveWin.title = `Save only this window (${win.tabs.length} tabs) as a workspace`;
    quickSaveWin.textContent = 'Save this window';
    quickSaveWin.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handlers.onSaveWindowDirect(win.id);
    });

    legend.append(selectAll, toggle, title, quickSaveWin);
    module.append(legend);

    // Preview favicon collection — first 7 links per window
    const preview = document.createElement('div');
    preview.className = 'favicon-preview';
    for (const tab of win.tabs.slice(0, FAVICON_PREVIEW_LIMIT)) {
      preview.append(previewFavicon(tab.icon));
    }
    module.append(preview);

    if (model.collapsedWindowId !== win.id) {
      const list = document.createElement('ul');
      list.className = 'selection-list';
      for (const tab of win.tabs) {
        const item = document.createElement('li');
        const row = document.createElement('label');
        row.className = 'selection-row';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = model.selectedTabIds.has(tab.tabId);
        checkbox.addEventListener('change', () => handlers.onTabToggle(tab.tabId));
        const text = document.createElement('span');
        text.textContent = tab.name;
        row.append(checkbox, text);
        item.append(row);
        list.append(item);
      }
      module.append(list);
    }

    panel.append(module);
  }

  panel.append(controls);
  container.append(panel);

  // Focus the input smoothly
  setTimeout(() => input.focus(), 0);
}