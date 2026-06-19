import { spawn, execSync, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { BinaryManager } from './binaries'
import { SettingsManager, HistoryItem } from './settings'
import { BrowserWindow } from 'electron'

export interface DownloadProgress {
  id: string
  percent: number
  speed: string
  eta: string
  status: 'downloading' | 'merging' | 'completed' | 'failed' | 'cancelled' | 'ready' | 'queued'
  fileName?: string
  title?: string
  thumbnail?: string
  uploader?: string
  duration?: number
  url?: string
  format?: 'mp4' | 'mp3' | 'best'
  resolution?: string
}

export class Downloader {
  private activeProcesses = new Map<
    string,
    {
      proc: ChildProcess
      filePaths: Set<string>
    }
  >()
  private binaryManager: BinaryManager
  private settingsManager: SettingsManager

  constructor(binaryManager: BinaryManager, settingsManager: SettingsManager) {
    this.binaryManager = binaryManager
    this.settingsManager = settingsManager
  }

  async download(
    id: string,
    url: string,
    format: 'mp4' | 'mp3' | 'best',
    resolution: string,
    window: BrowserWindow,
    title?: string,
    referer?: string
  ): Promise<void> {
    const settings = this.settingsManager.getSettings()
    const targetDir = format === 'mp3' ? settings.downloadDirMusic : settings.downloadDirVideo
    const proxy = settings.proxy

    const ytdlpPath = this.binaryManager.getYtdlpPath()
    const ffmpegPath = this.binaryManager.getFfmpegPath()

    // Ensure output directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    const args: string[] = []

    // Add proxy if configured
    if (proxy && proxy.trim()) {
      args.push('--proxy', proxy.trim())
    }

    // Add ffmpeg location if local local binary is used
    if (ffmpegPath && (ffmpegPath.includes('/') || ffmpegPath.includes('\\'))) {
      const ffmpegDir = path.dirname(ffmpegPath)
      args.push('--ffmpeg-location', ffmpegDir)
    }

    // Output template: saves file to targetDir
    args.push('-o', path.join(targetDir, '%(title)s.%(ext)s'))

    // Print progress in a clean format
    args.push('--newline')

    // Prevent downloading entire playlists when a video link belongs to a playlist
    if (url.includes('v=') || url.includes('/shorts/') || url.includes('embed/')) {
      args.push('--no-playlist')
    }

    // Quality/Format settings
    if (format === 'mp4') {
      if (resolution && resolution !== 'best') {
        args.push(
          '--format',
          `bestvideo[height<=${resolution}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${resolution}][ext=mp4]/best`
        )
      } else {
        args.push('--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best')
      }
    } else if (format === 'mp3') {
      // Extract MP3 audio
      args.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0')
    } else {
      // Best quality default (combines high def streams using ffmpeg)
      if (resolution && resolution !== 'best') {
        args.push('--format', `bestvideo[height<=${resolution}]+bestaudio/best`)
      } else {
        args.push('--format', 'bestvideo+bestaudio/best')
      }
    }

    // Add referer if provided
    if (referer) {
      args.push('--referer', referer)
    }

    // Add the target URL
    args.push(url)

    // Initial status
    const initialItem: HistoryItem = {
      id,
      url,
      title: title || 'Retrieving video details...',
      fileName: title ? `${title}${format === 'mp3' ? '.mp3' : '.mp4'}` : 'Pending...',
      filePath: '',
      fileSize: 'Unknown',
      date: new Date().toLocaleString(),
      format,
      status: 'downloading'
    }

    this.settingsManager.addHistoryItem(initialItem)
    this.sendProgress(window, {
      id,
      percent: 0,
      speed: '0 B/s',
      eta: '--:--',
      status: 'downloading',
      title: title || ''
    })

    console.log(`Spawning yt-dlp with args:`, args)

    const proc = spawn(ytdlpPath, args, {
      windowsHide: true
    })

    this.activeProcesses.set(id, { proc, filePaths: new Set<string>() })

    let stdoutBuffer = ''
    let parsedTitle = ''
    let parsedFileName = ''
    let finalFilePath = ''

    proc.stdout.on('data', (data) => {
      const chunk = data.toString()
      stdoutBuffer += chunk

      const lines = stdoutBuffer.split(/\r?\n/)
      // Keep last incomplete line in buffer
      stdoutBuffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        console.log(`[yt-dlp stdout]: ${line}`)

        // Extract title: standard yt-dlp first messages
        // e.g. [youtube] Extracting URL: https://...
        // e.g. [download] Destination: title.mp4
        if (line.includes('[download] Destination:')) {
          const match = line.match(/Destination:\s*(.+)$/)
          if (match && match[1]) {
            const destPath = match[1].trim()
            parsedFileName = path.basename(destPath)
            parsedTitle =
              parsedFileName.substring(0, parsedFileName.lastIndexOf('.')) || parsedFileName

            const info = this.activeProcesses.get(id)
            if (info) {
              info.filePaths.add(destPath)
            }

            this.settingsManager.updateHistoryItemStatus(id, 'downloading', {
              title: parsedTitle,
              fileName: parsedFileName,
              filePath: path.join(targetDir, parsedFileName)
            })
          }
        }

        // Parsing download progress
        // e.g. [download]   3.2% of   14.28MiB at    1.12MiB/s ETA 00:09
        if (line.includes('[download]') && line.includes('%')) {
          const progressMatch = line.match(
            /\[download\]\s+([\d.]+)%\s+of\s+([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/
          )
          if (progressMatch) {
            const percent = parseFloat(progressMatch[1])
            const totalSize = progressMatch[2]
            const speed = progressMatch[3]
            const eta = progressMatch[4]

            this.sendProgress(window, {
              id,
              percent,
              speed,
              eta,
              status: 'downloading',
              fileName: parsedFileName
            })

            this.settingsManager.updateHistoryItemStatus(id, 'downloading', {
              fileSize: totalSize
            })
          }
        }

        // Detect merge / post-process phase and capture the authoritative final
        // output path. The per-stream "Destination" lines above point at temp
        // files (e.g. title.f137.mp4), not the merged result.
        // e.g. [Merger] Merging formats into "/path/title.mp4"
        // e.g. [ExtractAudio] Destination: /path/title.mp3
        if (line.includes('[Merger]') || line.includes('[ExtractAudio]')) {
          const mergerMatch = line.match(/Merging formats into "(.+)"/)
          const extractMatch = line.match(/\[ExtractAudio\] Destination:\s*(.+)$/)
          const captured = (mergerMatch && mergerMatch[1]) || (extractMatch && extractMatch[1])
          if (captured) {
            finalFilePath = captured.trim()
            const info = this.activeProcesses.get(id)
            if (info) {
              info.filePaths.add(finalFilePath)
            }
          }

          this.sendProgress(window, {
            id,
            percent: 99,
            speed: 'Processing...',
            eta: '--:--',
            status: 'merging',
            fileName: finalFilePath ? path.basename(finalFilePath) : parsedFileName
          })
        }

        // Already-downloaded files report the final path directly.
        // e.g. [download] /path/title.mp4 has already been downloaded
        const alreadyMatch = line.match(/\[download\]\s+(.+?)\s+has already been downloaded/)
        if (alreadyMatch && alreadyMatch[1]) {
          finalFilePath = alreadyMatch[1].trim()
        }
      }
    })

    proc.stderr.on('data', (data) => {
      console.error(`[yt-dlp stderr]: ${data.toString()}`)
    })

    proc.on('close', (code) => {
      const wasCancelled = !this.activeProcesses.has(id)
      this.activeProcesses.delete(id)
      console.log(`Process for ${id} exited with code ${code}, wasCancelled: ${wasCancelled}`)

      if (code === 0) {
        // Success
        // Wait briefly for files to finish writing/moving
        setTimeout(() => {
          // Prefer the final path captured from the Merger/ExtractAudio step;
          // fall back to deriving it from the per-stream Destination line.
          let finalPath = finalFilePath
          if (!finalPath) {
            let derivedName = parsedFileName
            if (format === 'mp3') {
              // Audio extract overrides extension to mp3
              derivedName = parsedFileName
                ? `${parsedFileName.substring(0, parsedFileName.lastIndexOf('.'))}.mp3`
                : 'Audio_Download.mp3'
            }
            finalPath = path.join(targetDir, derivedName)
          }

          const finalFileName = path.basename(finalPath)
          let fileSize = 'Unknown'
          if (fs.existsSync(finalPath)) {
            const stats = fs.statSync(finalPath)
            const sizeMB = (stats.size / (1024 * 1024)).toFixed(2)
            fileSize = `${sizeMB} MiB`
          }

          const updatedTitle =
            parsedTitle ||
            (finalFileName.includes('.')
              ? finalFileName.substring(0, finalFileName.lastIndexOf('.'))
              : finalFileName)

          this.settingsManager.updateHistoryItemStatus(id, 'completed', {
            status: 'completed',
            title: updatedTitle,
            fileName: finalFileName,
            filePath: finalPath,
            fileSize
          })

          this.sendProgress(window, {
            id,
            percent: 100,
            speed: 'Done',
            eta: '00:00',
            status: 'completed',
            fileName: finalFileName
          })
        }, 500)
      } else {
        // Failed (if not cancelled)
        if (!wasCancelled) {
          const currentItem = this.settingsManager.getSettings().history.find((h) => h.id === id)
          if (currentItem && currentItem.status === 'downloading') {
            this.settingsManager.updateHistoryItemStatus(id, 'failed')
            this.sendProgress(window, {
              id,
              percent: 0,
              speed: 'Failed',
              eta: '--:--',
              status: 'failed'
            })
          }
        }
      }
    })
  }

  async getVideoInfo(url: string): Promise<
    {
      title: string
      thumbnail: string
      uploader: string
      duration: number
      url: string
      resolutions: string[]
    }[]
  > {
    const settings = this.settingsManager.getSettings()
    const proxy = settings.proxy
    const ytdlpPath = this.binaryManager.getYtdlpPath()

    // Use --flat-playlist to resolve playlists instantly
    const args: string[] = ['--flat-playlist', '--dump-json']

    if (proxy && proxy.trim()) {
      args.push('--proxy', proxy.trim())
    }
    args.push(url)

    return new Promise((resolve, reject) => {
      const proc = spawn(ytdlpPath, args, {
        windowsHide: true
      })

      let stdout = ''
      let stderr = ''
      let settled = false

      // Guard against a hung yt-dlp process (unreachable host, captcha wall, etc.)
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        proc.kill('SIGKILL')
        reject(new Error('Timed out fetching video info (30s).'))
      }, 30000)

      proc.on('error', (err) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        reject(err)
      })

      proc.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      proc.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)

        if (code !== 0) {
          reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`))
          return
        }

        try {
          const lines = stdout.split(/\r?\n/).filter((l) => l.trim() !== '')
          const results: any[] = []

          for (const line of lines) {
            const info = JSON.parse(line)

            let thumbnail = info.thumbnail || ''
            if (!thumbnail && info.id) {
              if (url.includes('youtube.com') || url.includes('youtu.be')) {
                thumbnail = `https://img.youtube.com/vi/${info.id}/mqdefault.jpg`
              }
            }

            let videoUrl = info.url || info.webpage_url || url
            if (info.id && (url.includes('youtube.com') || url.includes('youtu.be'))) {
              videoUrl = `https://www.youtube.com/watch?v=${info.id}`
            }

            results.push({
              title: info.title || 'Unknown Title',
              thumbnail: thumbnail,
              uploader: info.uploader || info.channel || 'Unknown Author',
              duration: info.duration || 0,
              url: videoUrl,
              resolutions: ['1080', '720', '480', '360', '240', '144']
            })
          }

          resolve(results)
        } catch (err: any) {
          reject(new Error(`Failed to parse video info: ${err.message}`))
        }
      })
    })
  }

  cancel(id: string, window: BrowserWindow): void {
    console.log(`[Downloader.cancel] Cancel requested for ID: ${id}`)
    console.log(
      `[Downloader.cancel] Currently active IDs:`,
      Array.from(this.activeProcesses.keys())
    )

    const info = this.activeProcesses.get(id)
    if (info) {
      console.log(`[Downloader.cancel] Found active process for ID: ${id}, PID: ${info.proc.pid}`)
      if (process.platform === 'win32') {
        const pid = info.proc.pid
        if (pid) {
          console.log(`[Downloader.cancel] Running taskkill /pid ${pid} /T /F to kill process tree`)
          try {
            const systemRoot = process.env.SystemRoot || 'C:\\Windows'
            const taskkillPath = path.join(systemRoot, 'System32', 'taskkill.exe')
            execSync(`"${taskkillPath}" /pid ${pid} /T /F`, { windowsHide: true })
            console.log(`[Downloader.cancel] taskkill /pid ${pid} /T /F executed successfully`)
          } catch (err) {
            console.error(`[Downloader.cancel] taskkill failed, falling back to process.kill:`, err)
            try {
              process.kill(pid, 'SIGKILL')
            } catch (e) {
              console.error(`[Downloader.cancel] process.kill fallback failed:`, e)
            }
          }
        } else {
          info.proc.kill('SIGKILL')
        }
      } else {
        info.proc.kill('SIGKILL')
      }

      this.activeProcesses.delete(id)

      // Auto delete partial files
      setTimeout(() => {
        for (const filePath of info.filePaths) {
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath)
              console.log(`Deleted cancelled download file: ${filePath}`)
            }
            const partPath = filePath + '.part'
            if (fs.existsSync(partPath)) {
              fs.unlinkSync(partPath)
              console.log(`Deleted cancelled download part file: ${partPath}`)
            }
            const ytdlPath = filePath + '.ytdl'
            if (fs.existsSync(ytdlPath)) {
              fs.unlinkSync(ytdlPath)
              console.log(`Deleted cancelled download ytdl file: ${ytdlPath}`)
            }
          } catch (err: any) {
            console.error(`Failed to clean up files for cancelled download ${id}:`, err)
          }
        }
      }, 500)

      // The partial file is deleted, so drop it from history entirely rather
      // than leaving a misleading "Failed" entry behind.
      this.settingsManager.removeHistoryItem(id)
      this.sendProgress(window, {
        id,
        percent: 0,
        speed: 'Cancelled',
        eta: '--:--',
        status: 'cancelled'
      })
    } else {
      console.warn(`[Downloader.cancel] No active process found for ID: ${id}`)
    }
  }

  private sendProgress(window: BrowserWindow, progress: DownloadProgress): void {
    if (!window.isDestroyed()) {
      window.webContents.send('download-progress', progress)
    }
  }
}
