const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const http = require('http');
const url = require('url');

const isDev = !app.isPackaged || process.env.ELECTRON_DEV === '1';
let nextServer = null;
let httpServer = null;

function createWindow(loadUrl) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
    autoHideMenuBar: process.platform !== 'darwin',
  });

  if (process.platform !== 'darwin') {
    win.setMenu(null);
    win.setMenuBarVisibility(false);
    Menu.setApplicationMenu(null);
  }

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    // no-op
  });

  win.loadURL(loadUrl);
}

async function startNextInProd() {
  process.env.NODE_ENV = 'production';
  // Resolve project root (works both in asar and unpacked)
  const projectRoot = path.join(__dirname, '..');

  const next = require('next');
  const nextApp = next({ dev: false, dir: projectRoot });
  const handle = nextApp.getRequestHandler();
  await nextApp.prepare();

  return new Promise((resolve, reject) => {
    try {
      httpServer = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url, true);
        handle(req, res, parsedUrl);
      });
      httpServer.listen(0, '127.0.0.1', () => {
        const address = httpServer.address();
        const port = address.port;
        resolve(`http://127.0.0.1:${port}`);
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function createMainWindow() {
  if (isDev) {
    const devUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000';
    createWindow(devUrl);
  } else {
    const url = await startNextInProd();
    createWindow(url);
  }
}

// Ensure single instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus the main window if a second instance is launched
    const all = BrowserWindow.getAllWindows();
    if (all.length) {
      const w = all[0];
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });

  app.whenReady().then(createMainWindow);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (httpServer) {
    try {
      httpServer.close();
    } catch (e) {
      // ignore
    }
  }
});
