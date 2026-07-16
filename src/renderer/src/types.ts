import { HistoryItem } from './components/HistoryList'

export interface AppSettings {
  downloadDir: string
  downloadDirVideo: string
  downloadDirMusic: string
  downloadDirFiles: string
  lastFormat: 'mp4' | 'mp3' | 'file'
  lastResolution: string
  proxy: string
  history: HistoryItem[]
  maxConcurrentDownloads?: number
}
