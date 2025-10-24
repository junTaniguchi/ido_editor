const { app, BrowserWindow, Menu, nativeImage, ipcMain, shell, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const { spawn } = require('child_process');

const isDev = !app.isPackaged || process.env.ELECTRON_DEV === '1';
let nextServer = null;
let httpServer = null;
let cachedIcon = null;

function loadAppIcon() {
  if (cachedIcon !== null) {
    return cachedIcon;
  }

  const basePaths = [app.getAppPath(), path.join(__dirname, '..')];
  const candidates = ['favicon.png', 'favicon.ico', 'favicon.svg'];

  for (const base of basePaths) {
    const publicDir = path.join(base, 'public');
    for (const name of candidates) {
      const candidate = path.join(publicDir, name);
      if (!fs.existsSync(candidate)) continue;
      const image = nativeImage.createFromPath(candidate);
      if (!image.isEmpty()) {
        cachedIcon = image;
        return cachedIcon;
      }
    }
  }

  cachedIcon = null;
  return cachedIcon;
}

function createWindow(loadUrl) {
  const icon = loadAppIcon();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
    autoHideMenuBar: process.platform !== 'darwin',
    icon: icon || undefined,
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

  if (process.platform === 'darwin' && icon) {
    app.dock.setIcon(icon);
  }
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

ipcMain.handle('dls:reveal-in-file-manager', async (_event, rawPath) => {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    throw new Error('Invalid path');
  }

  const targetPath = path.resolve(rawPath);

  try {
    const stats = await fs.promises.stat(targetPath);
    if (stats.isFile()) {
      shell.showItemInFolder(targetPath);
      return;
    }

    const result = await shell.openPath(targetPath);
    if (result) {
      throw new Error(result);
    }
  } catch (error) {
    console.error('Failed to reveal path in file manager:', error);
    throw error;
  }
});

ipcMain.handle('dls:pick-directory-path', async (_event, options = {}) => {
  const { title, message, defaultPath } = typeof options === 'object' && options !== null ? options : {};
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: typeof title === 'string' ? title : undefined,
      message: typeof message === 'string' ? message : undefined,
      defaultPath: typeof defaultPath === 'string' && defaultPath.trim() ? defaultPath : undefined,
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  } catch (error) {
    console.error('Failed to pick directory path via native dialog:', error);
    throw error;
  }
});

function launchWindowsTerminals(targetPath) {
  const commands = [
    {
      command: 'powershell.exe',
      args: ['-NoExit', '-Command', `Set-Location -LiteralPath '${targetPath.replace(/'/g, "''")}'`],
    },
    {
      command: 'cmd.exe',
      args: ['/K', `cd /d "${targetPath.replace(/"/g, '\\"')}"`],
    },
  ];

  let launched = false;
  for (const { command, args } of commands) {
    try {
      const child = spawn(command, args, {
        cwd: targetPath,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.unref();
      launched = true;
    } catch (error) {
      console.error(`Failed to launch ${command}:`, error);
    }
  }

  if (!launched) {
    throw new Error('Failed to launch any Windows terminal.');
  }
}

function launchMacTerminal(targetPath) {
  try {
    const child = spawn('open', ['-a', 'Terminal', targetPath], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch (error) {
    console.error('Failed to open Terminal.app:', error);
    throw error;
  }
}

function openTerminalAtPath(targetPath) {
  const normalizedPath = path.resolve(targetPath);

  if (process.platform === 'win32') {
    launchWindowsTerminals(normalizedPath);
    return;
  }

  if (process.platform === 'darwin') {
    launchMacTerminal(normalizedPath);
    return;
  }

  throw new Error('Terminal launching is not supported on this platform.');
}

ipcMain.handle('dls:open-terminal', async (_event, rawPath) => {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    throw new Error('Invalid path');
  }

  const targetPath = path.resolve(rawPath);

  try {
    const stats = await fs.promises.stat(targetPath);
    if (!stats.isDirectory()) {
      throw new Error('Target path is not a directory.');
    }

    openTerminalAtPath(targetPath);
  } catch (error) {
    console.error('Failed to launch terminal:', error);
    throw error;
  }
});

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
