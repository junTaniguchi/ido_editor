const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dlsNative', {
  revealInFileManager(path) {
    if (typeof path !== 'string' || !path.trim()) {
      return Promise.reject(new Error('Invalid path'));
    }
    return ipcRenderer.invoke('dls:reveal-in-file-manager', path);
  },
  openTerminal(path) {
    if (typeof path !== 'string' || !path.trim()) {
      return Promise.reject(new Error('Invalid path'));
    }
    return ipcRenderer.invoke('dls:open-terminal', path);
  },
});
