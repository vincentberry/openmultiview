/* Offline Electron application: packaged UI, embedded server and persistent local data. */
const {app, BrowserWindow, Menu, Tray, nativeImage, shell, dialog, session} = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const policy = require('./policy.cjs');
const root = path.resolve(__dirname, '..');
const smoke = process.argv.includes('--smoke-test');
if(smoke) app.disableHardwareAcceleration();
const port = Number(process.env.MULTIVIEW_PORT || 8090);
const origin = 'http://127.0.0.1:' + port;
const profile = process.env.MULTIVIEW_DESKTOP_DATA_DIR || path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'OpenMultiview', 'desktop');
require('node:fs').mkdirSync(profile, {recursive: true});
app.setName('OpenMultiview');
app.setPath('userData', profile);
let server, mainWindow, tray;
let quitting = false;
const windows = new Set();
const publicRequests = [];

function showMain() {
    if(!mainWindow || mainWindow.isDestroyed()) return;
    if(mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus();
}
function openExternal(url) {
    if(policy.externalLink(url)) shell.openExternal(url).catch(() => {});
}
function createWindow(url = origin + '/config.html', primary = false) {
    const win = new BrowserWindow({
        width: 1440, height: 940, minWidth: 760, minHeight: 620, show: false,
        title: 'OpenMultiview · Version hors ligne', backgroundColor: '#101b25', icon: path.join(root, 'favicon.ico'),
        autoHideMenuBar: true,
        webPreferences: {nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, spellcheck: false, offscreen: smoke}
    });
    windows.add(win);
    win.webContents.on('page-title-updated', event => { event.preventDefault(); });
    win.webContents.on('will-navigate', (event, target) => {
        if(!policy.appPage(target, origin)) { event.preventDefault(); openExternal(target); }
    });
    win.webContents.setWindowOpenHandler(({url: target}) => {
        if(policy.appPage(target, origin)) createWindow(target);
        else openExternal(target);
        return {action: 'deny'};
    });
    win.on('close', event => { if(primary && !quitting && !smoke) { event.preventDefault(); win.hide(); } });
    win.on('closed', () => windows.delete(win));
    win.once('ready-to-show', () => { if(!smoke) win.show(); });
    win.loadURL(url).catch(error => {
        if(smoke) { console.error(error.message); app.exit(1); }
        else dialog.showErrorBox('OpenMultiview', 'Impossible d’ouvrir l’interface locale : ' + error.message);
    });
    return win;
}

async function checkOfflineWindow(win) {
    const report = {packaged: app.isPackaged, passed: false};
    try {
        await new Promise((resolve, reject) => {
            if(!win.webContents.isLoading()) return resolve();
            win.webContents.once('did-finish-load', resolve);
            win.webContents.once('did-fail-load', (_, code, description) => reject(new Error(description + ' (' + code + ')')));
        });
        const marker = process.env.MULTIVIEW_SMOKE_MARKER || 'offline-smoke';
        const verify = process.env.MULTIVIEW_SMOKE_PHASE === 'verify';
        const first = await win.webContents.executeJavaScript(`(async () => {
            const status = await fetch('/companion-api').then(response => response.json());
            if(status.application !== 'OpenMultiview') throw new Error('Embedded server unavailable');
            if(typeof MultiviewModel === 'undefined' || !document.querySelector('#layoutGallery .layout-choice')) throw new Error('Packaged application did not initialize');
            if(typeof window.require !== 'undefined' || typeof window.process !== 'undefined') throw new Error('Renderer isolation failed');
            if(${verify}) {
                if(localStorage.getItem('openmultiview.desktop-smoke') !== ${JSON.stringify(marker)}) throw new Error('Profile did not survive app restart');
                if(!Array.from(document.querySelector('#savedPresets').options).some(option => option.text === 'Offline smoke test')) throw new Error('Preset did not survive app restart');
            } else {
                localStorage.setItem('openmultiview.desktop-smoke', ${JSON.stringify(marker)});
                document.querySelector('#presetName').value = 'Offline smoke test';
                document.querySelector('#savePreset').click();
                if(!Array.from(document.querySelector('#savedPresets').options).some(option => option.text === 'Offline smoke test')) throw new Error('Preset save failed');
            }
            const access = await fetch('/connection.js');
            if(!access.ok) throw new Error('Missing packaged script');
            return {templates: document.querySelectorAll('#layoutGallery .layout-choice').length, title: document.title};
        })()`);
        await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.webContents.reload(); });
        const persisted = await win.webContents.executeJavaScript(`(async () => {
            if(document.body.dataset.desktop !== 'true') throw new Error('Offline application mode missing');
            for(let attempt = 0; attempt < 100; attempt++) {
                if(document.querySelector('.local-badge.is-connected')) return localStorage.getItem('openmultiview.desktop-smoke') === ${JSON.stringify(marker)};
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            throw new Error('Embedded synchronization did not connect');
        })()`);
        if(!persisted) throw new Error('Settings did not survive reload');
        if(verify) await win.webContents.executeJavaScript(`localStorage.removeItem('openmultiview.desktop-smoke'); localStorage.removeItem('multiview.pc.regie.presets')`);
        if(publicRequests.length) throw new Error('Application requested an external resource: ' + publicRequests[0]);
        const internetBlocked = await win.webContents.executeJavaScript(`fetch('https://example.com/__offline_probe__').then(() => false, () => true)`);
        if(!internetBlocked || publicRequests.length !== 1) throw new Error('Offline network policy failed');
        report.blockedInternetProbe = true;
        report.profileSurvivedRestart = verify;
        if(process.env.MULTIVIEW_SMOKE_SCREENSHOT) {
            await win.webContents.executeJavaScript(`document.querySelector('#tab-connection').click()`);
            const screenshot = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => { win.webContents.removeListener('paint', onPaint); reject(new Error('Offline renderer did not paint')); }, 10000);
                function onPaint(event, dirty, image) {
                    if(image.isEmpty()) return;
                    clearTimeout(timer);
                    win.webContents.removeListener('paint', onPaint);
                    resolve(image.toPNG());
                }
                win.webContents.on('paint', onPaint);
                win.webContents.invalidate();
            });
            await fs.writeFile(process.env.MULTIVIEW_SMOKE_SCREENSHOT, screenshot);
        }
        report.passed = true;
        report.ui = first;
        if(process.env.MULTIVIEW_SMOKE_REPORT) await fs.writeFile(process.env.MULTIVIEW_SMOKE_REPORT, JSON.stringify(report, null, 2));
        quitting = true;
        app.quit();
    } catch(error) {
        report.error = error.message;
        if(process.env.MULTIVIEW_SMOKE_REPORT) await fs.writeFile(process.env.MULTIVIEW_SMOKE_REPORT, JSON.stringify(report, null, 2));
        console.error(error.message);
        quitting = true; app.exit(1);
    }
}

if(!app.requestSingleInstanceLock()) app.quit();
else {
    app.on('second-instance', showMain);
    app.on('window-all-closed', () => { if(quitting || smoke) app.quit(); });
    app.on('before-quit', () => { quitting = true; if(server) server.close(); });
    app.on('activate', showMain);
    app.whenReady().then(async () => {
        if(!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port local invalide.');
        app.setAppUserModelId('io.github.vincentberry.openmultiview');
        const canWriteClipboard = (contents, permission) => permission === 'clipboard-sanitized-write' && !!contents && policy.appPage(contents.getURL(), origin);
        session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(canWriteClipboard(contents, permission)));
        session.defaultSession.setPermissionCheckHandler((contents, permission) => canWriteClipboard(contents, permission));
        session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
            const allowed = policy.allowRequest(details.url, origin, details.resourceType);
            if(!allowed && /^https?:/.test(details.url)) publicRequests.push(details.url);
            callback({cancel: !allowed});
        });
        session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
            const headers = {...details.responseHeaders};
            if(new URL(details.url).origin === origin) headers['Content-Security-Policy'] = ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src http: https:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"];
            callback({responseHeaders: headers});
        });
        server = require('../server').createServer({desktop: true});
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
        Menu.setApplicationMenu(Menu.buildFromTemplate([
            {label: 'Application', submenu: [
                {label: 'Configuration', click: showMain},
                {label: 'Guide hors ligne', click: () => createWindow(origin + '/guide.html')},
                {type: 'separator'}, {label: 'Quitter OpenMultiview', click: () => { quitting = true; app.quit(); }}
            ]},
            {label: 'Affichage', submenu: [{role: 'reload'}, {role: 'resetZoom'}, {role: 'zoomIn'}, {role: 'zoomOut'}, {role: 'togglefullscreen'}]}
        ]));
        mainWindow = createWindow(origin + '/config.html', true);
        if(smoke) return checkOfflineWindow(mainWindow);
        tray = new Tray(nativeImage.createFromPath(path.join(root, 'favicon.ico')));
        tray.setToolTip('OpenMultiview · Application hors ligne');
        tray.setContextMenu(Menu.buildFromTemplate([
            {label: 'Ouvrir OpenMultiview', click: showMain},
            {label: 'Guide hors ligne', click: () => createWindow(origin + '/guide.html')},
            {type: 'separator'}, {label: 'Quitter', click: () => { quitting = true; app.quit(); }}
        ]));
        tray.on('double-click', showMain);
    }).catch(async error => {
        const message = error.code === 'EADDRINUSE' ? 'Le port ' + port + ' est déjà utilisé. Quittez l’ancien compagnon OpenMultiview avant d’ouvrir l’application hors ligne.' : error.message;
        if(smoke) {
            if(process.env.MULTIVIEW_SMOKE_REPORT) await fs.writeFile(process.env.MULTIVIEW_SMOKE_REPORT, JSON.stringify({passed: false, error: message}));
            app.exit(1);
        } else { dialog.showErrorBox('OpenMultiview', message); app.quit(); }
    });
}
