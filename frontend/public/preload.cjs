const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Settings management
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  testApiConnection: (settings) => ipcRenderer.invoke('test-api-connection', settings),
  
  // Window management
  resizeWindow: (width, height) => ipcRenderer.invoke('resize-window', width, height),
  
  // Backend status
  onBackendError: (callback) => ipcRenderer.on('backend-error', callback),
  removeBackendErrorListener: (callback) => ipcRenderer.removeListener('backend-error', callback),
  
  // App info
  getVersion: () => process.env.npm_package_version || '1.0.0',
  platform: process.platform
});
