# Tab Workspace Manager

Browser Session & Tab Workspace Manager  Chrome Extension (Manifest V3),
vanilla JavaScript, zero runtime dependencies. beta testing, some features and fixes are pending.

## Layout

- `src/shared/`      pure logic: constants, sanitization, schemas, message bus contracts
- `src/storage/`     Storage Abstraction Layer (partitioned sync store + repository)
- `src/platform/`    Native Platform Boundary (tabs/windows primitives)
- `src/cloud/`       External Cloud Integration Layer (Drive REST contract)
- `src/background/`  MV3 service worker: context menus, auto-save on close, backup queue
- `src/popup/`       toolbar UI: state machine, controller, view modules
- `tests/`           Node built-in test runner unit tests

## Run tests

    npm test        # Node >= 18

## Load the extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this directory

## Cloud sync (optional)

Replace `oauth2.client_id` in `manifest.json` with your Google Cloud OAuth
client authorized for the `drive.file` scope. Until configured, all local
functionality works offline; remote backups silently retry.
