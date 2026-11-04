const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { spawn, fork } = require('child_process');

let mainWindow = null;
let serverChild = null;

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function getFreePort(defaultPort = 3377) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(defaultPort, '127.0.0.1', () => {
      server.close(() => resolve(defaultPort));
    });
    server.on('error', () => {
      const fallback = net.createServer();
      fallback.listen(0, '127.0.0.1', () => {
        const port = fallback.address().port;
        fallback.close(() => resolve(port));
      });
    });
  });
}

function findServerScript() {
  const candidates = [
    path.join(__dirname, '..', '.next', 'standalone', 'server.js'),
    path.join(process.resourcesPath || '', 'app', '.next', 'standalone', 'server.js'),
    path.join(process.resourcesPath || '', '.next', 'standalone', 'server.js'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function waitForServer(url, timeoutMs = 30000) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      const req = http.get(url, (res) => {
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - startTime > timeoutMs) {
          reject(new Error(`Server at ${url} failed to start within ${timeoutMs / 1000} seconds.`));
        } else {
          setTimeout(poll, 250);
        }
      });
      req.end();
    };
    poll();
  });
}

async function startApp() {
  const port = await getFreePort(3377);
  const serverUrl = `http://127.0.0.1:${port}`;

  // Setup writable user data and storage paths
  const userDataDir = app.getPath('userData');
  const appDataDir = path.join(userDataDir, 'data');
  const storageDir = path.join(userDataDir, 'storage');

  if (!fs.existsSync(appDataDir)) fs.mkdirSync(appDataDir, { recursive: true });
  if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

  const serverEnv = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    NODE_ENV: 'production',
    DATA_DIR: appDataDir,
    STORAGE_DIR: storageDir,
  };

  // Ensure no external postgres is attempted in desktop standalone mode
  delete serverEnv.DATABASE_URL;

  // Bundled ffmpeg detection (if provided in resources/bin)
  const binaryExt = process.platform === 'win32' ? '.exe' : '';
  const candidateBinDirs = [
    path.join(process.resourcesPath || '', 'bin'),
    path.join(__dirname, '..', 'bin'),
  ];
  for (const binDir of candidateBinDirs) {
    const ffmpegPath = path.join(binDir, `ffmpeg${binaryExt}`);
    const ffprobePath = path.join(binDir, `ffprobe${binaryExt}`);
    if (fs.existsSync(ffmpegPath)) serverEnv.FFMPEG_PATH = ffmpegPath;
    if (fs.existsSync(ffprobePath)) serverEnv.FFPROBE_PATH = ffprobePath;
  }

  // Start Next.js server
  const serverScript = findServerScript();

  if (serverScript) {
    console.log(`[Desktop] Starting Next.js standalone server from: ${serverScript}`);
    console.log(`[Desktop] Data directory: ${appDataDir}`);
    console.log(`[Desktop] Storage directory: ${storageDir}`);

    const serverCwd = path.dirname(serverScript);

    if (app.isPackaged) {
      serverChild = spawn(process.execPath, [serverScript], {
        cwd: serverCwd,
        env: {
          ...serverEnv,
          ELECTRON_RUN_AS_NODE: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } else {
      serverChild = fork(serverScript, [], {
        cwd: serverCwd,
        env: serverEnv,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
    }

    serverChild.stdout?.on('data', (d) => console.log(`[Next.js] ${d.toString().trim()}`));
    serverChild.stderr?.on('data', (d) => console.error(`[Next.js ERR] ${d.toString().trim()}`));
    serverChild.on('exit', (code) => {
      console.log(`[Next.js] Server exited with code ${code}`);
    });

    try {
      await waitForServer(serverUrl, 30000);
    } catch (err) {
      dialog.showErrorBox('SceneMind Startup Error', `Could not start the internal server:\n${err.message}`);
      app.quit();
      return;
    }
  } else {
    // If running in development without pre-building standalone
    console.log('[Desktop] No standalone server found, attempting dev server at http://localhost:3000');
  }

  createMainWindow(serverScript ? serverUrl : 'http://localhost:3000');
}

function createMainWindow(targetUrl) {
  const iconPath = path.join(__dirname, 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'SceneMind AI',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  mainWindow.loadURL(targetUrl);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function cleanup() {
  if (serverChild && !serverChild.killed) {
    try {
      serverChild.kill();
    } catch (e) {
      // ignore
    }
    serverChild = null;
  }
}

app.on('ready', startApp);

app.on('window-all-closed', () => {
  cleanup();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', cleanup);
app.on('will-quit', cleanup);

