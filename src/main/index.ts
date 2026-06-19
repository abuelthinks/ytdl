import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { BinaryManager } from './binaries'
import { SettingsManager } from './settings'
import { Downloader } from './downloader'
import { LocalServer } from './server'

let mainWindow: BrowserWindow | null = null
const binaryManager = new BinaryManager()
const settingsManager = new SettingsManager()
const downloader = new Downloader(binaryManager, settingsManager)
const localServer = new LocalServer(downloader, () => mainWindow)

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 960,
    height: 700,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Register IPC Listeners
function registerIpcHandlers(): void {
  // Binary Management
  ipcMain.handle('check-binaries', () => {
    return binaryManager.getStatus()
  })

  ipcMain.handle('download-binaries', async () => {
    if (!mainWindow) return

    try {
      const status = binaryManager.getStatus()

      if (!status.ytdlp) {
        mainWindow.webContents.send('binary-status-update', {
          name: 'yt-dlp',
          status: 'downloading',
          percent: 0
        })
        await binaryManager.downloadYtdlp((percent) => {
          mainWindow?.webContents.send('binary-status-update', {
            name: 'yt-dlp',
            status: 'downloading',
            percent
          })
        })
        mainWindow.webContents.send('binary-status-update', {
          name: 'yt-dlp',
          status: 'completed',
          percent: 100
        })
      }

      if (!status.ffmpeg) {
        mainWindow.webContents.send('binary-status-update', {
          name: 'FFmpeg',
          status: 'downloading',
          percent: 0
        })
        await binaryManager.downloadFfmpeg((percent) => {
          mainWindow?.webContents.send('binary-status-update', {
            name: 'FFmpeg',
            status: 'downloading',
            percent
          })
        })
        mainWindow.webContents.send('binary-status-update', {
          name: 'FFmpeg',
          status: 'completed',
          percent: 100
        })
      }

      return { success: true }
    } catch (err: any) {
      console.error('Binary download failed:', err)
      mainWindow.webContents.send('binary-status-update', {
        name: 'Error',
        status: 'failed',
        percent: 0,
        error: err.message
      })
      return { success: false, error: err.message }
    }
  })

  // Settings & Configuration
  ipcMain.handle('get-settings', () => {
    return settingsManager.getSettings()
  })

  ipcMain.handle('update-settings', (_, updates) => {
    return settingsManager.updateSettings(updates)
  })

  ipcMain.handle('select-download-dir', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return null
  })

  ipcMain.handle('clear-history', () => {
    settingsManager.clearHistory()
    return settingsManager.getSettings()
  })

  ipcMain.handle('check-ytdl-updates', async () => {
    try {
      const current = await binaryManager.getLocalYtdlpVersion()
      const latest = await binaryManager.getLatestYtdlpVersion()
      const updateAvailable = current !== '' && latest !== '' && current !== latest
      return { current, latest, updateAvailable }
    } catch (err: any) {
      console.error('Failed to check for updates:', err)
      return { current: '', latest: '', updateAvailable: false, error: err.message }
    }
  })

  ipcMain.handle('update-ytdlp', async () => {
    if (!mainWindow) return { success: false }
    try {
      mainWindow.webContents.send('binary-status-update', {
        name: 'yt-dlp',
        status: 'downloading',
        percent: 0
      })
      await binaryManager.downloadYtdlp((percent) => {
        mainWindow?.webContents.send('binary-status-update', {
          name: 'yt-dlp',
          status: 'downloading',
          percent
        })
      })
      mainWindow.webContents.send('binary-status-update', {
        name: 'yt-dlp',
        status: 'completed',
        percent: 100
      })
      return { success: true }
    } catch (err: any) {
      console.error('Update failed:', err)
      mainWindow.webContents.send('binary-status-update', {
        name: 'yt-dlp',
        status: 'failed',
        percent: 0,
        error: err.message
      })
      return { success: false, error: err.message }
    }
  })

  // Downloads Action
  ipcMain.handle('start-download', async (_, { id, url, format, resolution, title }) => {
    if (!mainWindow) return
    // Download runs asynchronously and updates via webContents.send('download-progress')
    downloader.download(id, url, format, resolution, mainWindow, title).catch((err) => {
      mainWindow?.webContents.send('download-progress', {
        id,
        percent: 0,
        speed: 'Error',
        eta: '--:--',
        status: 'failed',
        error: err.message
      })
    })
  })

  ipcMain.handle('cancel-download', (_, id) => {
    if (!mainWindow) return
    downloader.cancel(id, mainWindow)
  })

  ipcMain.handle('get-video-info', async (_, url) => {
    return downloader.getVideoInfo(url)
  })

  ipcMain.handle('show-in-folder', async (_, filePath) => {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath)
      return true
    }
    return false
  })

  ipcMain.handle('play-file', async (_, filePath) => {
    if (filePath && fs.existsSync(filePath)) {
      await shell.openPath(filePath)
      return true
    }
    return false
  })
}

app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.mediadownloader.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  createWindow()
  localServer.start()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  localServer.stop()
})
