import { ElectronAPI } from '@electron-toolkit/preload'

export interface ApiBridge {
  checkBinaries: () => Promise<{ ytdlp: boolean; ffmpeg: boolean; needsDownload: boolean }>
  downloadBinaries: () => Promise<{ success: boolean; error?: string }>
  getSettings: () => Promise<any>
  updateSettings: (updates: any) => Promise<any>
  selectDownloadDir: () => Promise<string | null>
  clearHistory: () => Promise<any>
  startDownload: (args: {
    id: string
    url: string
    format: 'mp4' | 'mp3' | 'best'
    resolution: string
    title?: string
  }) => Promise<void>
  cancelDownload: (id: string) => Promise<void>
  getVideoInfo: (url: string) => Promise<
    {
      title: string
      thumbnail: string
      uploader: string
      duration: number
      url: string
      resolutions: string[]
    }[]
  >
  showInFolder: (filePath: string) => Promise<boolean>
  playFile: (filePath: string) => Promise<boolean>
  checkYtdlUpdates: () => Promise<{
    current: string
    latest: string
    updateAvailable: boolean
    error?: string
  }>
  updateYtdlp: () => Promise<{ success: boolean; error?: string }>
  systemInfo: {
    platform: string
    nodeVersion: string
    electronVersion: string
  }
  onBinaryStatusUpdate: (
    callback: (data: {
      name: string
      status: 'downloading' | 'completed' | 'failed'
      percent: number
      error?: string
    }) => void
  ) => () => void
  onDownloadProgress: (callback: (data: any) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ApiBridge
  }
}
