import { app, BrowserWindow, ipcMain, clipboard, Menu, dialog, shell } from 'electron'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import os from 'os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow

function getIconPath() {
  const isDev = process.env.VITE_DEV_SERVER_URL
  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  const iconDir = isDev ? '../public' : '../dist'
  return path.join(__dirname, iconDir, iconFile)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    frame: true,
    backgroundColor: '#f2f1f8',
    icon: getIconPath(),
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// Get default data path (in user's home directory)
function getDefaultDataPath() {
  return path.join(os.homedir(), 'promptbox_data')
}

// Settings file path (in Electron's userData directory)
function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.txt')
}

// Load saved data path from settings
function loadSavedDataPath() {
  try {
    const settingsPath = getSettingsPath()
    if (fs.existsSync(settingsPath)) {
      const savedPath = fs.readFileSync(settingsPath, 'utf8').trim()
      if (savedPath && fs.existsSync(savedPath)) {
        return savedPath
      }
    }
  } catch {
    // Ignore errors, return default
  }
  return getDefaultDataPath()
}

// Save data path to settings
function saveDataPath(dataPath) {
  try {
    fs.writeFileSync(getSettingsPath(), dataPath, 'utf8')
    return true
  } catch {
    return false
  }
}

// IPC Handlers
ipcMain.handle('get-default-path', () => loadSavedDataPath())

ipcMain.handle('save-data-path', (_, dataPath) => saveDataPath(dataPath))

ipcMain.handle('get-hostname', () => os.hostname())

ipcMain.handle('select-folder', async (_, currentPath) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: currentPath || getDefaultDataPath(),
    properties: ['openDirectory', 'createDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('copy-to-clipboard', (_, text) => {
  clipboard.writeText(text)
  return true
})

ipcMain.handle('get-projects', async (_, dataPath) => {
  const dirPath = dataPath || getDefaultDataPath()
  try {
    if (!fs.existsSync(dirPath)) return []
    const files = fs.readdirSync(dirPath)
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(dirPath, f)
        const stat = fs.statSync(filePath)
        return { name: f.replace('.json', ''), mtime: stat.mtimeMs }
      })
  } catch {
    return []
  }
})

ipcMain.handle('archive-prompt', async (_, { dataPath, projectName, prompt }) => {
  const dirPath = dataPath || getDefaultDataPath()
  const filePath = path.join(dirPath, `${projectName}.json`)

  // Ensure directory exists
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }

  // Read existing data or create new array
  let data = []
  if (fs.existsSync(filePath)) {
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch {
      // Backup corrupt file before overwriting
      const date = new Date().toISOString().replace(/[:.]/g, '-')
      const corruptPath = path.join(dirPath, `${projectName}_corrupt_${date}.json`)
      fs.copyFileSync(filePath, corruptPath)
      data = []
    }
  }

  // Add new entry
  data.push({
    prompt,
    timestamp: new Date().toISOString(),
    hostname: os.hostname()
  })

  // Write back
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
  return filePath
})

ipcMain.handle('show-in-folder', (_, filePath) => {
  shell.showItemInFolder(filePath)
})

ipcMain.handle('zoom-in', () => {
  const zoom = mainWindow.webContents.getZoomLevel()
  mainWindow.webContents.setZoomLevel(zoom + 0.5)
})

ipcMain.handle('zoom-out', () => {
  const zoom = mainWindow.webContents.getZoomLevel()
  mainWindow.webContents.setZoomLevel(zoom - 0.5)
})

ipcMain.handle('zoom-reset', () => {
  mainWindow.webContents.setZoomLevel(0)
})

ipcMain.handle('get-prompts', async (_, { dataPath, projectName }) => {
  const dirPath = dataPath || getDefaultDataPath()
  const filePath = path.join(dirPath, `${projectName}.json`)

  if (!fs.existsSync(filePath)) {
    return []
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
})
