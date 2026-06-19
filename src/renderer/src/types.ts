import { HistoryItem } from './components/HistoryList'

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
