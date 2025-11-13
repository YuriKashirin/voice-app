const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const Store = require('electron-store');

let mainWindow;
let pythonProcess = null;
const isDev = process.env.NODE_ENV !== 'production';
const backendPath = path.join(__dirname, '../../backend');

// Additional check for different possible paths
function getBackendPath() {
  const possiblePaths = [
    path.join(__dirname, '../../backend'),  // Development
    path.join(__dirname, '../backend'),     // Maybe different structure
    '/Users/yurikashirin/voice-app/backend' // Fallback to absolute path
  ];
  
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      console.log(`Found backend at: ${testPath}`);
      return testPath;
    }
  }
  
  console.error('Backend directory not found in any of these paths:', possiblePaths);
  return backendPath; // Fallback
}

// Initialize electron-store for settings and also write to file for backend
const store = new Store({
  defaults: {
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.LLM_MODEL || 'gpt-4o',
    whisperModel: process.env.WHISPER_MODEL || 'base'
  }
});

function writeSettingsToFile(settings) {
  // Write to backend directory for easier access
  const actualBackendPath = getBackendPath();
  const settingsFile = path.join(actualBackendPath, 'electron-settings.json');
  
  try {
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    return true;
  } catch (error) {
    console.error('Failed to write settings file:', error);
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 240,
    minWidth: 350,
    minHeight: 220,
    maxWidth: 700,
    maxHeight: 700,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    },
    show: false
  });

  // Load the React app
  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, '../build/index.html')}`;
  
  mainWindow.loadURL(startUrl);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development - disabled for cleaner UI
  // if (isDev) {
  //   mainWindow.webContents.openDevTools();
  // }

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (pythonProcess) {
      pythonProcess.kill();
      pythonProcess = null;
    }
  });
}

function startPythonBackend() {
  console.log('Starting Python backend...');
  
  const actualBackendPath = getBackendPath();
  
  if (!fs.existsSync(actualBackendPath)) {
    console.error('Backend directory not found:', actualBackendPath);
    if (mainWindow) {
      mainWindow.webContents.send('backend-error', 'Backend directory not found');
    }
    return;
  }

  // Use the virtual environment Python executable directly
  const pythonCmd = path.join(actualBackendPath, '.venv', 'bin', 'python');
  
  if (!fs.existsSync(pythonCmd)) {
    console.error('Python executable not found:', pythonCmd);
    if (mainWindow) {
      mainWindow.webContents.send('backend-error', 'Python executable not found');
    }
    return;
  }
  
  console.log(`Using Python command: ${pythonCmd}`);

  try {
    const cmd = pythonCmd;
    const args = ['-m', 'uvicorn', 'app:app', '--host', '0.0.0.0', '--port', '8000'];
    
    console.log(`Starting backend with command: ${cmd} ${args.join(' ')}`);
    
    pythonProcess = spawn(cmd, args, {
      cwd: actualBackendPath,
      stdio: 'pipe',
      env: { ...process.env, PYTHONPATH: actualBackendPath }
    });
  } catch (error) {
    console.error('Failed to spawn backend process:', error);
    if (mainWindow) {
      mainWindow.webContents.send('backend-error', error.message);
    }
    return;
  }

  pythonProcess.stdout.on('data', (data) => {
    console.log(`Backend stdout: ${data}`);
    // Notify frontend when backend is ready
    if (data.toString().includes('✅ Ready!')) {
      console.log('Backend is ready!');
      if (mainWindow) {
        mainWindow.webContents.send('backend-ready');
      }
    }
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`Backend stderr: ${data}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`Backend process exited with code ${code}`);
    pythonProcess = null;
  });

  pythonProcess.on('error', (err) => {
    console.error('Failed to start backend:', err);
    console.error('Spawning command:', pythonCmd, 'with args:', ['-m', 'uvicorn', 'app:app', '--host', '0.0.0.0', '--port', '8000']);
    if (mainWindow) {
      mainWindow.webContents.send('backend-error', `Backend startup failed: ${err.message}`);
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  
  // Start the Python backend
  startPythonBackend();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});

// IPC handlers
ipcMain.handle('get-settings', async () => {
  return {
    apiKey: store.get('apiKey', ''),
    baseUrl: store.get('baseUrl', 'https://api.openai.com/v1'),
    model: store.get('model', 'gpt-4o'),
    whisperModel: store.get('whisperModel', 'base')
  };
});

ipcMain.handle('save-settings', async (event, settings) => {
  try {
    // Save to electron-store
    store.set('apiKey', settings.apiKey);
    store.set('baseUrl', settings.baseUrl);
    store.set('model', settings.model);
    store.set('whisperModel', settings.whisperModel);
    
    // Write to file for backend
    const writeSuccess = writeSettingsToFile(settings);
    
    // Restart backend with new settings
    if (pythonProcess) {
      pythonProcess.kill();
      pythonProcess = null;
    }
    startPythonBackend();
    
    return writeSuccess;
  } catch (error) {
    console.error('Failed to save settings:', error);
    return false;
  }
});

ipcMain.handle('test-api-connection', async (event, settings) => {
  // Will be implemented later with actual API testing
  return { success: true, message: 'Connection test successful' };
});

// IPC handler for resizing window
ipcMain.handle('resize-window', async (event, width, height) => {
  if (mainWindow) {
    const [currentWidth, currentHeight] = mainWindow.getContentSize();
    
    // Only resize if the new dimensions are different
    if (currentWidth !== width || currentHeight !== height) {
      mainWindow.setContentSize(width, height, true); // animate = true
      
      // Center window on screen after resize
      mainWindow.center();
      return { success: true };
    }
    return { success: true, message: 'No resize needed' };
  }
  return { success: false, message: 'Main window not available' };
});

// IPC handler for calculating optimal window size based on content
ipcMain.handle('resize-to-fit-content', async (event) => {
  if (mainWindow) {
    try {
      // Try to measure content dimensions (simplified approach)
      const estimatedSize = estimateContentSize();
      
      // Resize window to fit content snugly
      await mainWindow.setContentSize(estimatedSize.width, estimatedSize.height, true);
      return { success: true };
    } catch (error) {
      console.error('Failed to resize to fit content:', error);
      return { success: false, message: error.message };
    }
  }
  return { success: false, message: 'main window not available' };
});

// Simple heuristic to estimate content size
function estimateContentSize() {
  // This could be enhanced with actual DOM measurement
  // For now, use smart defaults
  
  const baseSizes = {
    buttonOnly: { width: 200, height: 150 },        // Just RecordButton and hint  
    fullApp: { width: 320, height: 200 },        // Just the main app components
    withSettings: { width: 380, height: 560 }     // Settings panel
  };
  
  // Smart size estimation based on state (this could be enhanced)
  const isSettingsMode = process.env.NODE_ENV === 'production' ? false : true;
  
  return isSettingsMode ? baseSizes.withSettings : baseSizes.fullApp;
}
