const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getDefaultPath: () => ipcRenderer.invoke('get-default-path'),
  saveDataPath: (dataPath) => ipcRenderer.invoke('save-data-path', dataPath),
  getHostname: () => ipcRenderer.invoke('get-hostname'),
  selectFolder: (currentPath) => ipcRenderer.invoke('select-folder', currentPath),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  getProjects: (dataPath) => ipcRenderer.invoke('get-projects', dataPath),
  archivePrompt: (data) => ipcRenderer.invoke('archive-prompt', data),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
  zoomIn: () => ipcRenderer.invoke('zoom-in'),
  zoomOut: () => ipcRenderer.invoke('zoom-out'),
  zoomReset: () => ipcRenderer.invoke('zoom-reset'),
  getPrompts: (data) => ipcRenderer.invoke('get-prompts', data),
})
