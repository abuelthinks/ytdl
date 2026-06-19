import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  checkBinaries: () => ipcRenderer.invoke('check-binaries'),
  downloadBinaries: () => ipcRenderer.invoke('download-binaries'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (updates: any) => ipcRenderer.invoke('update-settings', updates),
  selectDownloadDir: () => ipcRenderer.invoke('select-download-dir'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  startDownload: (args: {
    id: string
    url: string
    format: 'mp4' | 'mp3' | 'best'
    resolution: string
    title?: string
  }) => ipcRenderer.invoke('start-download', args),
  cancelDownload: (id: string) => ipcRenderer.invoke('cancel-download', id),
  getVideoInfo: (url: string) => ipcRenderer.invoke('get-video-info', url),
  showInFolder: (filePath: string) => ipcRenderer.invoke('show-in-folder', filePath),
  playFile: (filePath: string) => ipcRenderer.invoke('play-file', filePath),
  checkYtdlUpdates: () => ipcRenderer.invoke('check-ytdl-updates'),
  updateYtdlp: () => ipcRenderer.invoke('update-ytdlp'),

  systemInfo: {
    platform: process.platform,
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron
  },

  // Event Listeners (exposes a unsubscribe function)
  onBinaryStatusUpdate: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on('binary-status-update', listener)
    return () => {
      ipcRenderer.removeListener('binary-status-update', listener)
    }
  },
  onDownloadProgress: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on('download-progress', listener)
    return () => {
      ipcRenderer.removeListener('download-progress', listener)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
