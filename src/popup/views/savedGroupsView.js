/**
 * Saved Groups View — pure DOM presentation.
 * Modern collapsible workspace cards with clean SVG icon controls,
 * favicon previews, and inline delete confirmation.
 */
import { isAllowedIconUri } from '../../shared/sanitize.js';

// Track expanded workspace card states across renders
const expandedWorkspaces = new Set();
let isFirstRender = true;

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
function buildFavicon(icon) {
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
 * SVG Icons map
 */
const ICONS = {
  newWindow: `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M14 2.5a.5.5 0 0 0-.5-.5h-6a.5.5 0 0 0 0 1h4.793L2.146 13.146a.5.5 0 0 0 .708.708L13 3.707V8.5a.5.5 0 0 0 1 0v-6z"/><path fill-rule="evenodd" d="M3 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5a.5.5 0 0 0-1 0v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5a.5.5 0 0 0 0-1H3z"/></svg>`,
  currentWindow: `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/><path d="M4 4h8v2H4V4z"/></svg>`,
  copy: `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>`,
  up: `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8 3.5a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5z"/><path fill-rule="evenodd" d="M7.646 2.646a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8 3.707 5.354 6.354a.5.5 0 1 1-.708-.708l3-3z"/></svg>`,
  down: `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8 12.5a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 1 0v9a.5.5 0 0 1-.5.5z"/><path fill-rule="evenodd" d="M8.354 13.354a.5.5 0 0 1-.708 0l-3-3a.5.5 0 0 1 .708-.708L8 12.293l2.646-2.647a.5.5 0 0 1 .708.708l-3 3z"/></svg>`,
  edit: `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207l6.5-6.5zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.499.499 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11l.178-.178z"/></svg>`,
  trash: `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>`,
  chevronDown: `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg>`,
  chevronUp: `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M7.646 4.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1-.708.708L8 5.707l-5.646 5.647a.5.5 0 0 1-.708-.708l6-6z"/></svg>`,
};

/**
 * Creates an icon button.
 */
function iconButton(iconHtml, title, onClick, className = 'btn icon-btn') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.innerHTML = iconHtml;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

/**
 * Renders the workspace collection list.
 * @param {HTMLElement} container
 * @param {object} model
 * @param {Array<{ name: string, links: Array<{name: string, link: string, icon?: string}>, order: number }>} model.groups
 * @param {string} model.filter
 * @param {object} handlers
 * @param {(name: string) => void} handlers.onOpenCurrentWindow
 * @param {(name: string) => void} handlers.onOpenNewWindow
 * @param {(groupName: string, link: string) => void} handlers.onOpenLink
 * @param {(name: string, direction: -1|1) => void} handlers.onReorder
 * @param {(name: string) => void} handlers.onRename
 * @param {(name: string) => void} handlers.onDelete
 * @param {(name: string, text: string) => void} [handlers.onCopyLinks]
 */
export function renderSavedGroupsView(container, model, handlers) {
  container.replaceChildren();

  if (model.groups.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state-card';
    empty.innerHTML = `
      <div class="empty-icon">🗂️</div>
      <h3>No workspaces saved yet</h3>
      <p>Click <strong>+ Add Group</strong> above to capture your open browser tabs into a clean workspace.</p>
    `;
    container.append(empty);
    return;
  }

  // First time rendering: expand the first group by default
  if (isFirstRender && model.groups.length > 0) {
    expandedWorkspaces.add(model.groups[0].name);
    isFirstRender = false;
  }

  const query = model.filter.trim().toLowerCase();
  const matchesGroup = (group) => query.length === 0
    || group.name.toLowerCase().includes(query)
    || group.links.some((link) => link.name.toLowerCase().includes(query)
      || link.link.toLowerCase().includes(query));

  const visible = model.groups
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter(matchesGroup);

  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state-card';
    empty.innerHTML = `
      <div class="empty-icon">🔍</div>
      <h3>No matching workspaces</h3>
      <p>No workspaces or links match "<em>${query}</em>".</p>
    `;
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'btn';
    clearBtn.textContent = 'Clear Filter';
    clearBtn.addEventListener('click', () => {
      const searchInput = document.getElementById('search-input');
      if (searchInput) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
      }
    });
    empty.append(clearBtn);
    container.append(empty);
    return;
  }

  for (const group of visible) {
    const card = document.createElement('section');
    card.className = 'group-card';
    card.dataset.groupName = group.name;

    // Expand / collapse state
    const isExpanded = query.length > 0 || expandedWorkspaces.has(group.name);

    const header = document.createElement('header');
    header.className = 'group-card-header';
    header.title = 'Click to expand/collapse';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'group-header-left';

    const chevron = document.createElement('span');
    chevron.className = 'group-chevron';
    chevron.innerHTML = isExpanded ? ICONS.chevronUp : ICONS.chevronDown;

    const title = document.createElement('h3');
    title.className = 'group-title';
    title.textContent = group.name;

    const countBadge = document.createElement('span');
    countBadge.className = 'count-badge';
    countBadge.textContent = `${group.links.length} tab${group.links.length === 1 ? '' : 's'}`;

    headerLeft.append(chevron, title, countBadge);

    // Header Actions
    const actions = document.createElement('div');
    actions.className = 'group-actions';

    // Fast restore buttons
    const openNewBtn = document.createElement('button');
    openNewBtn.type = 'button';
    openNewBtn.className = 'btn primary group-open-btn';
    openNewBtn.title = `Open all ${group.links.length} tabs in a new window`;
    openNewBtn.innerHTML = `${ICONS.newWindow} Open`;
    openNewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.onOpenNewWindow(group.name);
    });

    const openCurrentBtn = iconButton(
      ICONS.currentWindow,
      'Append tabs into current window',
      () => handlers.onOpenCurrentWindow(group.name),
    );

    // Copy all links
    const copyBtn = iconButton(
      ICONS.copy,
      'Copy all tab links to clipboard',
      () => {
        const text = group.links.map((l) => `${l.name}: ${l.link}`).join('\n');
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.classList.add('copied');
          setTimeout(() => copyBtn.classList.remove('copied'), 1500);
        }).catch(() => {});
      },
    );

    const reorderUpBtn = iconButton(
      ICONS.up,
      'Move workspace up',
      () => handlers.onReorder(group.name, -1),
    );

    const reorderDownBtn = iconButton(
      ICONS.down,
      'Move workspace down',
      () => handlers.onReorder(group.name, 1),
    );

    const renameBtn = iconButton(
      ICONS.edit,
      'Rename workspace',
      () => handlers.onRename(group.name),
    );

    const deleteBtn = iconButton(
      ICONS.trash,
      'Delete workspace',
      () => showInlineDeleteConfirm(card, group.name, () => handlers.onDelete(group.name)),
      'btn icon-btn danger',
    );

    actions.append(openNewBtn, openCurrentBtn, copyBtn, reorderUpBtn, reorderDownBtn, renameBtn, deleteBtn);

    header.append(headerLeft, actions);

    // Clicking header toggles expansion
    header.addEventListener('click', () => {
      if (expandedWorkspaces.has(group.name)) {
        expandedWorkspaces.delete(group.name);
      } else {
        expandedWorkspaces.add(group.name);
      }
      renderSavedGroupsView(container, model, handlers);
    });

    card.append(header);

    // Compact favicon preview strip when collapsed
    if (!isExpanded) {
      const previewStrip = document.createElement('div');
      previewStrip.className = 'group-preview-strip';
      const previewSlice = group.links.slice(0, 8);
      for (const link of previewSlice) {
        previewStrip.append(buildFavicon(link.icon ?? ''));
      }
      if (group.links.length > 8) {
        const moreBadge = document.createElement('span');
        moreBadge.className = 'preview-more-badge';
        moreBadge.textContent = `+${group.links.length - 8}`;
        previewStrip.append(moreBadge);
      }
      previewStrip.addEventListener('click', () => {
        expandedWorkspaces.add(group.name);
        renderSavedGroupsView(container, model, handlers);
      });
      card.append(previewStrip);
    } else {
      // Expanded: render full links list
      const list = document.createElement('ul');
      list.className = 'link-list';
      for (const link of group.links) {
        const item = document.createElement('li');
        item.className = 'link-item';

        const linkBtn = document.createElement('button');
        linkBtn.type = 'button';
        linkBtn.className = 'link-row';
        linkBtn.title = `Open: ${link.link}`;
        linkBtn.addEventListener('click', () => handlers.onOpenLink(group.name, link.link));

        linkBtn.append(buildFavicon(link.icon ?? ''));

        const textContainer = document.createElement('div');
        textContainer.className = 'link-text';

        const label = document.createElement('span');
        label.className = 'link-label';
        label.textContent = link.name;

        const url = document.createElement('span');
        url.className = 'link-url';
        url.textContent = formatDisplayUrl(link.link);

        textContainer.append(label, url);
        linkBtn.append(textContainer);
        item.append(linkBtn);
        list.append(item);
      }
      card.append(list);
    }

    container.append(card);
  }
}

/**
 * Formats URLs to look clean and concise.
 * @param {string} rawUrl
 * @returns {string}
 */
function formatDisplayUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./, '') + (parsed.pathname !== '/' ? parsed.pathname : '');
  } catch {
    return rawUrl;
  }
}

/**
 * Shows an inline confirmation bar inside the card to prevent popup freeze from window.confirm
 */
function showInlineDeleteConfirm(card, groupName, onConfirm) {
  const existingConfirm = card.querySelector('.inline-confirm-bar');
  if (existingConfirm) return;

  const bar = document.createElement('div');
  bar.className = 'inline-confirm-bar';
  bar.innerHTML = `
    <span>Delete "<strong>${groupName}</strong>"?</span>
    <div class="confirm-actions">
      <button type="button" class="btn danger confirm-yes">Delete</button>
      <button type="button" class="btn subtle confirm-no">Cancel</button>
    </div>
  `;

  bar.querySelector('.confirm-yes')?.addEventListener('click', (e) => {
    e.stopPropagation();
    onConfirm();
  });
  bar.querySelector('.confirm-no')?.addEventListener('click', (e) => {
    e.stopPropagation();
    bar.remove();
  });

  card.prepend(bar);
}