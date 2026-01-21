'use strict';

const { app, Tray, Menu, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { autoUpdater } = require('electron-updater');
const { startServer } = require('../server');

// Electron launcher: starts the local API server, opens the browser UI, and lives in the tray.
const SERVER_HOST = '127.0.0.1';
const BASE_PORT = 3000;
const PORT_FALLBACK_LIMIT = 20;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

let currentPort = BASE_PORT;

let tray = null;
let serverInstance = null;
let updateCheckInProgress = false;
let backgroundCheckInProgress = false;
let updateReadyInfo = null;
let updateDownloadProgress = null;

// Single-instance guard: second launch reuses the running server and opens the UI.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        openLocal();
    });
}

function getAppRoot() {
    return app.isPackaged ? app.getAppPath() : path.join(__dirname, '..');
}

function ensureDataDir() {
    const dataDir = path.join(app.getPath('userData'), 'data');
    // Writable location for yt-dlp downloads and temp files (works inside packaged apps).
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    return dataDir;
}

function waitForServer(url, timeoutMs = 20000) {
    // Poll until the HTTP server responds, with a startup timeout.
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const attempt = () => {
            const req = http.get(url, (res) => {
                res.resume();
                resolve();
            });
            req.on('error', () => {
                if (Date.now() - start > timeoutMs) {
                    reject(new Error('Server did not become ready in time.'));
                    return;
                }
                setTimeout(attempt, 500);
            });
        };
        attempt();
    });
}

function getServerUrl(hostname) {
    const host = hostname || 'localhost';
    return `http://${host}:${currentPort}`;
}

function openLocal() {
    shell.openExternal(getServerUrl('localhost'));
}

function buildTray() {
    // Tray-only app: no windows, just menu actions.
    const iconPath = process.platform === 'win32'
        ? path.join(getAppRoot(), 'public', 'assets', 'favicon.ico')
        : path.join(getAppRoot(), 'public', 'assets', 'favicon-16x16.png');
    const baseIcon = nativeImage.createFromPath(iconPath);
    const targetSize = process.platform === 'darwin' ? 16 : 24;
    const trayIcon = baseIcon.isEmpty()
        ? baseIcon
        : baseIcon.resize({ width: targetSize, height: targetSize });
    tray = new Tray(trayIcon);
    tray.setToolTip('youtube2txt');
    updateTrayMenu();
    tray.on('double-click', openLocal);
}

function updateTrayMenu() {
    if (!tray) return;
    const menuItems = [
        { label: 'Open on browser', click: openLocal }
    ];
    if (updateReadyInfo) {
        menuItems.push({ label: 'Update ready to install', click: showUpdateReadyDialog });
    } else if (typeof updateDownloadProgress === 'number') {
        menuItems.push({ label: `Downloading update... ${updateDownloadProgress}%`, enabled: false });
    } else {
        menuItems.push({ label: 'Check for updates', click: checkForUpdatesWithFeedback });
    }
    menuItems.push(
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() }
    );
    tray.setContextMenu(Menu.buildFromTemplate(menuItems));
}

function showUpdateMessage({ type, message, detail }) {
    dialog.showMessageBox({
        type,
        buttons: ['OK'],
        defaultId: 0,
        cancelId: 0,
        message,
        detail
    });
}

function checkForUpdatesWithFeedback() {
    if (!app.isPackaged) {
        showUpdateMessage({
            type: 'info',
            message: 'Updates are only available in packaged builds.'
        });
        return;
    }
    if (updateCheckInProgress || backgroundCheckInProgress) {
        showUpdateMessage({
            type: 'info',
            message: 'Update check already in progress',
            detail: 'Please wait for the current check to finish.'
        });
        return;
    }

    updateCheckInProgress = true;
    const finish = () => {
        updateCheckInProgress = false;
        autoUpdater.removeListener('update-available', onUpdateAvailable);
        autoUpdater.removeListener('update-not-available', onUpdateNotAvailable);
        autoUpdater.removeListener('error', onUpdateError);
    };

    const onUpdateAvailable = () => {
        showUpdateMessage({
            type: 'info',
            message: 'Update available',
            detail: 'Downloading update...'
        });
        finish();
    };

    const onUpdateNotAvailable = () => {
        showUpdateMessage({
            type: 'info',
            message: 'No updates available',
            detail: 'You are already on the latest version.'
        });
        finish();
    };

    const onUpdateError = (error) => {
        const detail = error && error.message ? error.message : String(error);
        showUpdateMessage({
            type: 'error',
            message: 'Update check failed',
            detail
        });
        finish();
    };

    autoUpdater.on('update-available', onUpdateAvailable);
    autoUpdater.on('update-not-available', onUpdateNotAvailable);
    autoUpdater.on('error', onUpdateError);

    autoUpdater.checkForUpdates().catch((error) => {
        const detail = error && error.message ? error.message : String(error);
        showUpdateMessage({
            type: 'error',
            message: 'Update check failed',
            detail
        });
        finish();
    });
}

function checkForUpdatesInBackground() {
    if (!app.isPackaged) return;
    if (updateCheckInProgress || backgroundCheckInProgress) return;
    backgroundCheckInProgress = true;
    autoUpdater.checkForUpdates()
        .catch((error) => {
            const detail = error && error.message ? error.message : String(error);
            console.error('[Updater] Background check failed:', detail);
        })
        .finally(() => {
            backgroundCheckInProgress = false;
        });
}

async function cleanupOldUpdateCaches(downloadedFile) {
    if (!downloadedFile) return;
    const cacheDir = path.dirname(downloadedFile);
    const updateFileName = path.basename(downloadedFile);
    const keepNames = new Set();
    keepNames.add('update-info.json');
    keepNames.add('current.blockmap');
    keepNames.add(updateFileName);
    keepNames.add(`${updateFileName}.blockmap`);

    let entries = [];
    try {
        entries = await fs.promises.readdir(cacheDir, { withFileTypes: true });
    } catch (error) {
        if (error && error.code === 'ENOENT') return;
        console.error('[Updater] Cache cleanup failed:', error && error.message ? error.message : String(error));
        return;
    }

    await Promise.all(entries.map(async (entry) => {
        if (keepNames.has(entry.name) || entry.name.startsWith('package-')) return;
        const entryPath = path.join(cacheDir, entry.name);
        try {
            await fs.promises.rm(entryPath, { recursive: true, force: true });
        } catch (error) {
            console.error('[Updater] Cache cleanup failed:', error && error.message ? error.message : String(error));
        }
    }));
}

async function showUpdateReadyDialog() {
    if (!updateReadyInfo) return;
    const result = await dialog.showMessageBox({
        type: 'info',
        buttons: ['Restart', 'Later'],
        defaultId: 0,
        cancelId: 1,
        message: 'Update ready to install',
        detail: 'Restart the app to install the latest update.'
    });
    if (result.response === 0) {
        autoUpdater.quitAndInstall();
    }
}

function setupAutoUpdater() {
    // Updates only work for packaged builds with GitHub Releases.
    if (!app.isPackaged) return;
    autoUpdater.autoDownload = true;
    autoUpdater.on('update-downloaded', async (info) => {
        updateReadyInfo = info || { version: 'unknown' };
        updateDownloadProgress = null;
        updateTrayMenu();
        await cleanupOldUpdateCaches(info && info.downloadedFile);
    });
    autoUpdater.on('update-available', () => {
        updateDownloadProgress = 0;
        updateTrayMenu();
    });
    autoUpdater.on('update-not-available', () => {
        updateDownloadProgress = null;
        updateTrayMenu();
    });
    autoUpdater.on('download-progress', (progress) => {
        const percent = Math.max(0, Math.min(100, Math.round(progress && progress.percent ? progress.percent : 0)));
        updateDownloadProgress = percent;
        updateTrayMenu();
    });
    autoUpdater.on('error', (error) => {
        updateDownloadProgress = null;
        updateTrayMenu();
        const detail = error && error.message ? error.message : String(error);
        console.error('[Updater] Error:', detail);
    });
}

async function boot() {
    // Start local server, wait for readiness, then keep the tray ready for the user to open the UI.
    app.setAppUserModelId('com.spacesoda.youtube2txt');
    if (process.platform === 'darwin' && app.dock) {
        app.dock.hide();
    }
    setupAutoUpdater();

    const dataDir = ensureDataDir();
    const appRoot = getAppRoot();

    try {
        const result = await startServerWithFallback({ dataDir, appRoot });
        serverInstance = result.server;
    } catch (error) {
        const detail = error && error.code === 'EADDRINUSE'
            ? (error.message || `Ports ${BASE_PORT}-${BASE_PORT + PORT_FALLBACK_LIMIT - 1} are already in use.`)
            : (error && error.message ? error.message : String(error));
        await dialog.showMessageBox({
            type: 'error',
            buttons: ['Quit'],
            message: 'Failed to start youtube2txt',
            detail
        });
        app.quit();
        return;
    }

    try {
        await waitForServer(getServerUrl(SERVER_HOST));
    } catch (error) {
        const result = await dialog.showMessageBox({
            type: 'warning',
            buttons: ['Open Anyway', 'Quit'],
            defaultId: 0,
            cancelId: 1,
            message: 'Server is slow to respond',
            detail: 'The local server is still starting. You can try opening the app anyway.'
        });
        if (result.response === 1) {
            app.quit();
            return;
        }
    }

    buildTray();
    if (app.isPackaged) {
        // Silent background check/download; UI is surfaced via the tray menu item when ready.
        checkForUpdatesInBackground();
        setInterval(checkForUpdatesInBackground, ONE_WEEK_MS);
    }
}

async function startServerWithFallback({ dataDir, appRoot }) {
    // Try a small port range to avoid collisions with other local servers.
    for (let offset = 0; offset < PORT_FALLBACK_LIMIT; offset += 1) {
        const port = BASE_PORT + offset;
        try {
            const result = await startServer({
                host: SERVER_HOST,
                port,
                dataDir,
                appRoot
            });
            currentPort = port;
            if (port !== BASE_PORT) {
                console.log(`[Launcher] Port ${BASE_PORT} busy, using ${port}.`);
            }
            return result;
        } catch (error) {
            if (error && error.code === 'EADDRINUSE') {
                continue;
            }
            throw error;
        }
    }

    const error = new Error(`Ports ${BASE_PORT}-${BASE_PORT + PORT_FALLBACK_LIMIT - 1} are already in use.`);
    error.code = 'EADDRINUSE';
    throw error;
}

app.on('before-quit', () => {
    if (serverInstance) {
        serverInstance.close();
        serverInstance = null;
    }
});

app.on('window-all-closed', (event) => {
    event.preventDefault();
});

if (gotLock) {
    app.whenReady().then(boot);
}
