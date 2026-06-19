import { app } from 'electron'
import fs from 'fs'
import path from 'path'

export interface HistoryItem {
  id: string
  url: string
  title: string
  fileName: string
  filePath: string
  fileSize: string
  date: string
  format: 'mp4' | 'mp3' | 'best'
  status: 'completed' | 'failed' | 'downloading'
}

export interface AppSettings {
  downloadDir: string
  downloadDirVideo: string
  downloadDirMusic: string
  lastFormat: 'mp4' | 'mp3'
  lastResolution: string
  proxy: string
  history: HistoryItem[]
  maxConcurrentDownloads?: number
}

export class SettingsManager {
  private configPath: string
  private settings: AppSettings

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'settings.json')
    this.settings = this.loadSettings()
  }

  private loadSettings(): AppSettings {
    const defaultSettings: AppSettings = {
      downloadDir: app.getPath('downloads'),
      downloadDirVideo: path.join(app.getPath('downloads'), 'Video'),
      downloadDirMusic: path.join(app.getPath('downloads'), 'Music'),
      lastFormat: 'mp4',
      lastResolution: '1080',
      proxy: '',
      history: [],
      maxConcurrentDownloads: 5
    }

    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8')
        const parsed = JSON.parse(data)
        const dir = parsed.downloadDir || defaultSettings.downloadDir
        let videoDir =
          parsed.downloadDirVideo ||
          path.join(parsed.downloadDir || defaultSettings.downloadDir, 'Video')
        let musicDir =
          parsed.downloadDirMusic ||
          path.join(parsed.downloadDir || defaultSettings.downloadDir, 'Music')

        if (videoDir === dir) {
          videoDir = path.join(dir, 'Video')
        }
        if (musicDir === dir) {
          musicDir = path.join(dir, 'Music')
        }

        return {
          downloadDir: dir,
          downloadDirVideo: videoDir,
          downloadDirMusic: musicDir,
          lastFormat: parsed.lastFormat || defaultSettings.lastFormat,
          lastResolution: parsed.lastResolution || defaultSettings.lastResolution,
          proxy: parsed.proxy || defaultSettings.proxy,
          history: parsed.history || defaultSettings.history,
          maxConcurrentDownloads:
            parsed.maxConcurrentDownloads !== undefined
              ? parsed.maxConcurrentDownloads
              : defaultSettings.maxConcurrentDownloads
        }
      }
    } catch (err) {
      console.error('Failed to load settings, using defaults:', err)
    }

    return defaultSettings
  }

  private saveSettings(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.settings, null, 2), 'utf8')
    } catch (err) {
      console.error('Failed to save settings:', err)
    }
  }

  getSettings(): AppSettings {
    return this.settings
  }

  updateSettings(updates: Partial<Omit<AppSettings, 'history'>>): AppSettings {
    if (updates.downloadDir) {
      this.settings.downloadDir = updates.downloadDir
    }
    if (updates.downloadDirVideo) {
      this.settings.downloadDirVideo = updates.downloadDirVideo
    }
    if (updates.downloadDirMusic) {
      this.settings.downloadDirMusic = updates.downloadDirMusic
    }
    if (updates.lastFormat) {
      this.settings.lastFormat = updates.lastFormat
    }
    if (updates.lastResolution) {
      this.settings.lastResolution = updates.lastResolution
    }
    if (updates.proxy !== undefined) {
      this.settings.proxy = updates.proxy
    }
    if (updates.maxConcurrentDownloads !== undefined) {
      this.settings.maxConcurrentDownloads = updates.maxConcurrentDownloads
    }
    this.saveSettings()
    return this.settings
  }

  addHistoryItem(item: HistoryItem): void {
    // Remove if already exists with same ID to avoid duplicates
    this.settings.history = this.settings.history.filter((h) => h.id !== item.id)
    this.settings.history.unshift(item) // Add to top
    this.saveSettings()
  }

  updateHistoryItemStatus(
    id: string,
    status: HistoryItem['status'],
    extra?: Partial<HistoryItem>
  ): void {
    const item = this.settings.history.find((h) => h.id === id)
    if (item) {
      item.status = status
      if (extra) {
        Object.assign(item, extra)
      }
      this.saveSettings()
    }
  }

  removeHistoryItem(id: string): void {
    this.settings.history = this.settings.history.filter((h) => h.id !== id)
    this.saveSettings()
  }

  clearHistory(): void {
    this.settings.history = []
    this.saveSettings()
  }
}
