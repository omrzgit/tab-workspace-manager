/**
 * Settings View — loads toggles for session capture, auto-export, and Drive sync.
 * Includes the Export/Import subsystem entry points.
 */
/**
 * @param {HTMLElement} container
 * @param {object} model
 * @param {object} model.settings
 * @param {string|null} model.statusMessage transient SUCCESS/ERROR copy
 * @param {boolean} model.statusIsError
 * @param {object} handlers
 * @param {(key: string, value: any) => void} handlers.onToggle
 * @param {() => void} handlers.onExport
 * @param {(file: File) => void} handlers.onImportFile
 * @param {() => void} handlers.onSyncDriveNow
 * @param {() => void} handlers.onBack
 */
export function renderSettingsView(container, model, handlers) {
  container.replaceChildren();

  const panel = document.createElement('section');
  panel.className = 'settings-panel';

  const heading = document.createElement('h2');
  heading.textContent = 'General Preferences';
  panel.append(heading);

  if (model.statusMessage) {
    const status = document.createElement('p');
    status.className = model.statusIsError ? 'inline-error' : 'success-banner';
    status.setAttribute('role', 'status');
    status.textContent = model.statusMessage;
    panel.append(status);
  }

  /** @param {string} label @param {boolean} checked @param {(v: boolean) => void} onChange */
  const toggleRow = (label, checked, onChange) => {
    const row = document.createElement('label');
    row.className = 'toggle-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = checked;
    box.addEventListener('change', () => onChange(box.checked));
    const text = document.createElement('span');
    text.textContent = label;
    row.append(box, text);
    return row;
  };

  panel.append(
    toggleRow(
      'Exclude pinned tabs from workspace captures',
      model.settings.ignorePinnedTabs,
      (value) => handlers.onToggle('ignorePinnedTabs', value),
    ),
    toggleRow(
      'Close tabs automatically after saving them to a workspace',
      model.settings.closeTabsOnSaveGroup,
      (value) => handlers.onToggle('closeTabsOnSaveGroup', value),
    ),
  );

  // Auto Export Section
  const autoExportHeading = document.createElement('h2');
  autoExportHeading.textContent = 'Auto Export to JSON';
  panel.append(autoExportHeading);

  panel.append(
    toggleRow(
      'Enable automated JSON backup',
      model.settings.autoExportJson ?? false,
      (value) => handlers.onToggle('autoExportJson', value),
    ),
  );

  if (model.settings.autoExportJson) {
    const autoExportSub = document.createElement('div');
    autoExportSub.className = 'settings-subpanel';

    const triggerLabel = document.createElement('label');
    triggerLabel.className = 'select-row';
    triggerLabel.innerHTML = `<span>Trigger export:</span>`;
    const triggerSelect = document.createElement('select');
    triggerSelect.className = 'settings-select';
    triggerSelect.innerHTML = `
      <option value="both">When new tab opens & On timer</option>
      <option value="tab_open">When new tab opens</option>
      <option value="timer">On timer only</option>
    `;
    triggerSelect.value = model.settings.autoExportTrigger || 'both';
    triggerSelect.addEventListener('change', () => {
      handlers.onToggle('autoExportTrigger', triggerSelect.value);
    });
    triggerLabel.append(triggerSelect);
    autoExportSub.append(triggerLabel);

    if (model.settings.autoExportTrigger !== 'tab_open') {
      const timerLabel = document.createElement('label');
      timerLabel.className = 'select-row';
      timerLabel.innerHTML = `<span>Timer interval:</span>`;
      const timerSelect = document.createElement('select');
      timerSelect.className = 'settings-select';
      timerSelect.innerHTML = `
        <option value="5">Every 5 minutes</option>
        <option value="15">Every 15 minutes</option>
        <option value="30">Every 30 minutes</option>
        <option value="60">Every 1 hour</option>
      `;
      timerSelect.value = String(model.settings.autoExportTimerMinutes || 15);
      timerSelect.addEventListener('change', () => {
        handlers.onToggle('autoExportTimerMinutes', parseInt(timerSelect.value, 10));
      });
      timerLabel.append(timerSelect);
      autoExportSub.append(timerLabel);
    }

    const note = document.createElement('p');
    note.className = 'settings-hint';
    note.textContent = '💡 Overwrites "TabWorkspaces_AutoBackup.json" in Downloads to eliminate disk bloat.';
    autoExportSub.append(note);

    panel.append(autoExportSub);
  }

  // Google Drive Section
  const driveHeading = document.createElement('h2');
  driveHeading.textContent = 'Google Drive Cloud Sync';
  panel.append(driveHeading);

  panel.append(
    toggleRow(
      'Periodically sync workspaces to Google Drive in background',
      model.settings.periodicDriveBackup ?? false,
      (value) => handlers.onToggle('periodicDriveBackup', value),
    ),
  );

  if (model.settings.periodicDriveBackup) {
    const driveSub = document.createElement('div');
    driveSub.className = 'settings-subpanel';

    const driveTimerLabel = document.createElement('label');
    driveTimerLabel.className = 'select-row';
    driveTimerLabel.innerHTML = `<span>Sync interval:</span>`;
    const driveTimerSelect = document.createElement('select');
    driveTimerSelect.className = 'settings-select';
    driveTimerSelect.innerHTML = `
      <option value="15">Every 15 minutes</option>
      <option value="30">Every 30 minutes</option>
      <option value="60">Every 1 hour</option>
    `;
    driveTimerSelect.value = String(model.settings.periodicDriveBackupMinutes || 30);
    driveTimerSelect.addEventListener('change', () => {
      handlers.onToggle('periodicDriveBackupMinutes', parseInt(driveTimerSelect.value, 10));
    });
    driveTimerLabel.append(driveTimerSelect);
    driveSub.append(driveTimerLabel);

    panel.append(driveSub);
  }

  const driveActionsRow = document.createElement('div');
  driveActionsRow.className = 'exchange-row';
  const syncNowBtn = document.createElement('button');
  syncNowBtn.type = 'button';
  syncNowBtn.className = 'btn';
  syncNowBtn.textContent = '☁️ Backup to Google Drive Now';
  syncNowBtn.addEventListener('click', handlers.onSyncDriveNow);
  driveActionsRow.append(syncNowBtn);
  panel.append(driveActionsRow);

  // Manual File Export / Import
  const exchangeHeading = document.createElement('h2');
  exchangeHeading.textContent = 'Manual Export / Import';
  panel.append(exchangeHeading);

  const exportRow = document.createElement('div');
  exportRow.className = 'exchange-row';
  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.className = 'btn';
  exportButton.textContent = 'Export to JSON file';
  exportButton.addEventListener('click', handlers.onExport);
  exportRow.append(exportButton);

  const importLabel = document.createElement('label');
  importLabel.className = 'btn file-button';
  importLabel.textContent = 'Import from JSON file';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.hidden = true;
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handlers.onImportFile(file);
    fileInput.value = '';
  });
  importLabel.append(fileInput);
  exportRow.append(importLabel);
  panel.append(exportRow);

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'btn subtle';
  back.textContent = '← Back to workspaces';
  back.addEventListener('click', handlers.onBack);
  panel.append(back);

  container.append(panel);
}