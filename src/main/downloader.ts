import { spawn, execSync, ChildProcess } from 'child_process'
import http from 'http'
import https from 'https'
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
  status:
    | 'downloading'
    | 'merging'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'ready'
    | 'queued'
    | 'paused'
  fileName?: string
  title?: string
  thumbnail?: string
  uploader?: string
  duration?: number
  url?: string
  format?: 'mp4' | 'mp3' | 'best' | 'file' | 'torrent'
  resolution?: string
  fileSize?: string
  error?: string
}

export class Downloader {
  private activeProcesses = new Map<
    string,
    {
      proc: ChildProcess
      filePaths: Set<string>
      kind: 'ytdlp' | 'torrent'
      lastPercent: number
    }
  >()
  private activeFileDownloads = new Map<
    string,
    {
      req: http.ClientRequest
      filePath: string
      cancelled: boolean
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
    format: 'mp4' | 'mp3' | 'best' | 'file' | 'torrent',
    resolution: string,
    window: BrowserWindow,
    title?: string,
    referer?: string
  ): Promise<void> {
    // Direct file downloads (PDFs, archives, images, etc.) bypass yt-dlp entirely
    if (format === 'file') {
      return this.downloadFile(id, url, window, title, referer)
    }

    // Magnet links and .torrent URLs go through the aria2 torrent engine
    if (format === 'torrent') {
      return this.downloadTorrent(id, url, window, title)
    }

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
    // Include url/format/resolution so queue items created by this event
    // (extension-initiated downloads) hold everything needed to retry later
    this.sendProgress(window, {
      id,
      percent: 0,
      speed: '0 B/s',
      eta: '--:--',
      status: 'downloading',
      title: title || '',
      url,
      format,
      resolution
    })

    console.log(`Spawning yt-dlp with args:`, args)

    const proc = spawn(ytdlpPath, args, {
      windowsHide: true
    })

    this.activeProcesses.set(id, {
      proc,
      filePaths: new Set<string>(),
      kind: 'ytdlp',
      lastPercent: 0
    })

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
              fileName: parsedFileName,
              fileSize: totalSize
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

  // Downloads torrent content (magnet link or .torrent URL) via aria2c,
  // installing the engine on first use like the other managed binaries.
  private async downloadTorrent(
    id: string,
    url: string,
    window: BrowserWindow,
    title?: string
  ): Promise<void> {
    const settings = this.settingsManager.getSettings()
    const targetDir = settings.downloadDirFiles || path.join(settings.downloadDir, 'Files')

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    const initialName = title || 'Torrent download'
    this.settingsManager.addHistoryItem({
      id,
      url,
      title: initialName,
      fileName: initialName,
      filePath: '',
      fileSize: 'Unknown',
      date: new Date().toLocaleString(),
      format: 'torrent',
      status: 'downloading'
    })
    this.sendProgress(window, {
      id,
      percent: 0,
      speed: 'Connecting...',
      eta: '--:--',
      status: 'downloading',
      title: initialName,
      url,
      format: 'torrent',
      resolution: 'best'
    })

    // Lazy-install aria2c on first torrent download
    if (!this.binaryManager.hasAria2()) {
      try {
        await this.binaryManager.downloadAria2((percent) => {
          this.sendProgress(window, {
            id,
            percent: 0,
            speed: `Installing torrent engine... ${percent}%`,
            eta: '--:--',
            status: 'downloading',
            title: initialName
          })
        })
      } catch (err: any) {
        console.error('Failed to install aria2:', err)
        this.settingsManager.updateHistoryItemStatus(id, 'failed')
        this.sendProgress(window, {
          id,
          percent: 0,
          speed: 'Failed',
          eta: '--:--',
          status: 'failed',
          error: err.message
        })
        return
      }
    }

    const aria2Path = this.binaryManager.getAria2Path()
    const args = [
      '--seed-time=0',
      '--summary-interval=1',
      '--console-log-level=warn',
      '--follow-torrent=mem',
      '--bt-save-metadata=false',
      '-d',
      targetDir,
      url
    ]

    console.log(`Spawning aria2c with args:`, args)

    const proc = spawn(aria2Path, args, {
      windowsHide: true
    })

    this.activeProcesses.set(id, {
      proc,
      filePaths: new Set<string>(),
      kind: 'torrent',
      lastPercent: 0
    })

    let stdoutBuffer = ''
    let capturedPath = ''

    proc.stdout.on('data', (data) => {
      stdoutBuffer += data.toString()
      const lines = stdoutBuffer.split(/\r?\n/)
      stdoutBuffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        console.log(`[aria2c stdout]: ${line}`)

        // Track the output path so cancel can clean up and history can link it.
        // Multi-file torrents report a file inside the torrent's root folder,
        // so resolve back to the first path segment under targetDir.
        // e.g. FILE: C:\Downloads\Files\Ubuntu\ubuntu.iso
        const fileMatch = line.match(/^\s*FILE:\s*(.+)$/)
        if (fileMatch && fileMatch[1] && !fileMatch[1].includes('[METADATA]')) {
          const reported = fileMatch[1].trim()
          const relative = path.relative(targetDir, reported)
          if (relative && !relative.startsWith('..')) {
            const rootSegment = relative.split(/[\\/]/)[0]
            capturedPath = path.join(targetDir, rootSegment)
            const info = this.activeProcesses.get(id)
            if (info) {
              info.filePaths.add(capturedPath)
            }
            this.settingsManager.updateHistoryItemStatus(id, 'downloading', {
              title: rootSegment,
              fileName: rootSegment,
              filePath: capturedPath
            })
          }
        }

        // Progress readout, printed every summary interval
        // e.g. [#6f2yj7 87MiB/1.2GiB(7%) CN:24 SD:15 DL:5.1MiB ETA:3m48s]
        const progressMatch = line.match(
          /\[#\w+\s+[\d.]+(?:[KMGTP]i)?B\/([\d.]+(?:[KMGTP]i)?B)\((\d+(?:\.\d+)?)%\)/
        )
        if (progressMatch) {
          const totalSize = progressMatch[1]
          const percent = parseFloat(progressMatch[2])
          const speedMatch = line.match(/DL:([\d.]+(?:[KMGTP]i)?B)/)
          const etaMatch = line.match(/ETA:([^\s\]]+)/)

          const info = this.activeProcesses.get(id)
          if (info) {
            info.lastPercent = percent
          }

          this.sendProgress(window, {
            id,
            percent,
            speed: speedMatch ? `${speedMatch[1]}/s` : '0 B/s',
            eta: etaMatch ? etaMatch[1] : '--:--',
            status: 'downloading',
            fileName: capturedPath ? path.basename(capturedPath) : undefined,
            fileSize: totalSize
          })

          this.settingsManager.updateHistoryItemStatus(id, 'downloading', {
            fileSize: totalSize
          })
        }
      }
    })

    proc.stderr.on('data', (data) => {
      console.error(`[aria2c stderr]: ${data.toString()}`)
    })

    proc.on('error', (err) => {
      console.error(`Failed to spawn aria2c:`, err)
    })

    proc.on('close', (code) => {
      const wasCancelled = !this.activeProcesses.has(id)
      this.activeProcesses.delete(id)
      console.log(`aria2c for ${id} exited with code ${code}, wasCancelled: ${wasCancelled}`)

      if (code === 0) {
        const finalName = capturedPath ? path.basename(capturedPath) : initialName
        this.settingsManager.updateHistoryItemStatus(id, 'completed', {
          status: 'completed',
          title: finalName,
          fileName: finalName,
          filePath: capturedPath,
          fileSize: capturedPath ? this.formatBytes(this.getPathSize(capturedPath)) : 'Unknown'
        })
        this.sendProgress(window, {
          id,
          percent: 100,
          speed: 'Done',
          eta: '00:00',
          status: 'completed',
          fileName: finalName
        })
      } else if (!wasCancelled) {
        this.settingsManager.updateHistoryItemStatus(id, 'failed')
        this.sendProgress(window, {
          id,
          percent: 0,
          speed: 'Failed',
          eta: '--:--',
          status: 'failed'
        })
      }
    })
  }

  // Total size of a file, or a directory tree (multi-file torrents)
  private getPathSize(target: string): number {
    try {
      const stats = fs.statSync(target)
      if (stats.isFile()) return stats.size
      if (stats.isDirectory()) {
        return fs
          .readdirSync(target)
          .reduce((sum, entry) => sum + this.getPathSize(path.join(target, entry)), 0)
      }
    } catch {
      // Path missing or unreadable — treat as zero
    }
    return 0
  }

  // Downloads any direct file URL (PDF, ZIP, image, installer, ...) over HTTP
  // with the same progress/cancel/history flow as media downloads.
  private downloadFile(
    id: string,
    url: string,
    window: BrowserWindow,
    title?: string,
    referer?: string
  ): Promise<void> {
    const settings = this.settingsManager.getSettings()
    const targetDir = settings.downloadDirFiles || path.join(settings.downloadDir, 'Files')

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    const initialName = title || this.fileNameFromUrl(url) || 'Direct file'
    this.settingsManager.addHistoryItem({
      id,
      url,
      title: initialName,
      fileName: initialName,
      filePath: '',
      fileSize: 'Unknown',
      date: new Date().toLocaleString(),
      format: 'file',
      status: 'downloading'
    })
    this.sendProgress(window, {
      id,
      percent: 0,
      speed: '0 B/s',
      eta: '--:--',
      status: 'downloading',
      title: initialName,
      url,
      format: 'file',
      resolution: 'best'
    })

    return new Promise((resolve) => {
      const fail = (message: string): void => {
        const entry = this.activeFileDownloads.get(id)
        if (entry?.cancelled) {
          resolve()
          return
        }
        this.activeFileDownloads.delete(id)
        console.error(`File download ${id} failed:`, message)
        this.settingsManager.updateHistoryItemStatus(id, 'failed')
        this.sendProgress(window, {
          id,
          percent: 0,
          speed: 'Failed',
          eta: '--:--',
          status: 'failed'
        })
        resolve()
      }

      const request = (currentUrl: string, redirectsLeft: number): void => {
        let parsed: URL
        try {
          parsed = new URL(currentUrl)
        } catch {
          fail('Invalid URL')
          return
        }

        const lib = parsed.protocol === 'http:' ? http : https
        const req = lib.get(
          parsed,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
              ...(referer ? { Referer: referer } : {})
            }
          },
          (res) => {
            const status = res.statusCode || 0

            if (status >= 300 && status < 400 && res.headers.location) {
              res.resume()
              if (redirectsLeft <= 0) {
                fail('Too many redirects')
                return
              }
              request(new URL(res.headers.location, currentUrl).toString(), redirectsLeft - 1)
              return
            }

            if (status < 200 || status >= 300) {
              res.resume()
              fail(`Server responded with status ${status}`)
              return
            }

            const fileName = this.resolveFileName(
              res.headers['content-disposition'],
              currentUrl,
              title
            )
            const filePath = this.uniquePath(targetDir, fileName)
            const totalBytes = parseInt(res.headers['content-length'] || '', 10) || 0

            const entry = this.activeFileDownloads.get(id)
            if (entry) {
              entry.req = req
              entry.filePath = filePath
            }

            this.settingsManager.updateHistoryItemStatus(id, 'downloading', {
              title: path.basename(filePath, path.extname(filePath)) || fileName,
              fileName: path.basename(filePath),
              filePath,
              ...(totalBytes > 0 ? { fileSize: this.formatBytes(totalBytes) } : {})
            })

            const out = fs.createWriteStream(filePath)
            let received = 0
            let lastSent = 0
            let lastBytes = 0
            let lastTime = Date.now()

            res.on('data', (chunk: Buffer) => {
              received += chunk.length
              const now = Date.now()
              if (now - lastSent >= 250) {
                const speedBps = ((received - lastBytes) / Math.max(now - lastTime, 1)) * 1000
                this.sendProgress(window, {
                  id,
                  percent: totalBytes > 0 ? (received / totalBytes) * 100 : 0,
                  speed: `${this.formatBytes(speedBps)}/s`,
                  eta:
                    totalBytes > 0 && speedBps > 0
                      ? this.formatEta((totalBytes - received) / speedBps)
                      : '--:--',
                  status: 'downloading',
                  fileName: path.basename(filePath),
                  fileSize: totalBytes > 0 ? this.formatBytes(totalBytes) : undefined
                })
                lastSent = now
                lastBytes = received
                lastTime = now
              }
            })

            res.pipe(out)

            out.on('finish', () => {
              const finished = this.activeFileDownloads.get(id)
              if (finished?.cancelled) {
                resolve()
                return
              }
              this.activeFileDownloads.delete(id)
              this.settingsManager.updateHistoryItemStatus(id, 'completed', {
                status: 'completed',
                fileSize: this.formatBytes(received)
              })
              this.sendProgress(window, {
                id,
                percent: 100,
                speed: 'Done',
                eta: '00:00',
                status: 'completed',
                fileName: path.basename(filePath)
              })
              resolve()
            })

            res.on('error', (err) => {
              out.destroy()
              this.cleanupPartialFile(filePath)
              fail(err.message)
            })
            out.on('error', (err) => {
              req.destroy()
              this.cleanupPartialFile(filePath)
              fail(err.message)
            })
          }
        )

        req.setTimeout(30000, () => {
          req.destroy(new Error('Connection timed out'))
        })
        req.on('error', (err) => fail(err.message))

        const entry = this.activeFileDownloads.get(id)
        if (entry) {
          entry.req = req
        } else {
          this.activeFileDownloads.set(id, { req, filePath: '', cancelled: false })
        }
      }

      request(url, 5)
    })
  }

  private resolveFileName(
    disposition: string | undefined,
    url: string,
    fallbackTitle?: string
  ): string {
    let name = ''
    if (disposition) {
      const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)
      const plain = disposition.match(/filename="?([^";]+)"?/i)
      if (utf8 && utf8[1]) {
        try {
          name = decodeURIComponent(utf8[1])
        } catch {
          name = utf8[1]
        }
      } else if (plain && plain[1]) {
        name = plain[1]
      }
    }
    if (!name) {
      name = this.fileNameFromUrl(url)
    }
    if (!name) {
      name = fallbackTitle || 'download'
    }
    return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'download'
  }

  private fileNameFromUrl(url: string): string {
    try {
      const pathname = new URL(url).pathname
      const base = pathname.split('/').filter(Boolean).pop() || ''
      return decodeURIComponent(base)
    } catch {
      return ''
    }
  }

  private uniquePath(dir: string, fileName: string): string {
    const ext = path.extname(fileName)
    const base = path.basename(fileName, ext)
    let candidate = path.join(dir, fileName)
    let counter = 1
    while (fs.existsSync(candidate)) {
      candidate = path.join(dir, `${base} (${counter})${ext}`)
      counter++
    }
    return candidate
  }

  private cleanupPartialFile(filePath: string): void {
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch (err) {
      console.error(`Failed to clean up partial file ${filePath}:`, err)
    }
  }

  private formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B'
    const units = ['B', 'KiB', 'MiB', 'GiB']
    let value = bytes
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024
      unit++
    }
    return `${value.toFixed(unit === 0 ? 0 : value >= 100 ? 1 : 2)} ${units[unit]}`
  }

  private formatEta(totalSeconds: number): string {
    const total = Math.max(0, Math.round(totalSeconds))
    const hrs = Math.floor(total / 3600)
    const mins = Math.floor((total % 3600) / 60)
    const secs = total % 60
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // HEAD request to read Content-Length for direct file links
  private getRemoteFileSize(url: string): Promise<string> {
    return new Promise((resolve) => {
      const attempt = (currentUrl: string, redirectsLeft: number): void => {
        let parsed: URL
        try {
          parsed = new URL(currentUrl)
        } catch {
          resolve('Unknown')
          return
        }

        const lib = parsed.protocol === 'http:' ? http : https
        const req = lib.request(
          parsed,
          {
            method: 'HEAD',
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
            }
          },
          (res) => {
            res.resume()
            const status = res.statusCode || 0
            if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
              attempt(new URL(res.headers.location, currentUrl).toString(), redirectsLeft - 1)
              return
            }
            const length = parseInt(res.headers['content-length'] || '', 10)
            resolve(length > 0 ? this.formatBytes(length) : 'Unknown')
          }
        )

        req.setTimeout(10000, () => {
          req.destroy()
          resolve('Unknown')
        })
        req.on('error', () => resolve('Unknown'))
        req.end()
      }

      attempt(url, 5)
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

    // Prevent fetching entire playlists when a video link belongs to a playlist
    if (url.includes('v=') || url.includes('/shorts/') || url.includes('embed/')) {
      args.push('--no-playlist')
    }

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

  async getFileSize(
    url: string,
    format: 'mp4' | 'mp3' | 'best' | 'file' | 'torrent',
    resolution: string
  ): Promise<string> {
    if (format === 'file') {
      return this.getRemoteFileSize(url)
    }

    // Torrent size is only known once metadata is fetched from peers
    if (format === 'torrent') {
      return 'Unknown'
    }

    const settings = this.settingsManager.getSettings()
    const proxy = settings.proxy
    const ytdlpPath = this.binaryManager.getYtdlpPath()

    const args: string[] = ['--simulate', '--no-playlist']

    if (proxy && proxy.trim()) {
      args.push('--proxy', proxy.trim())
    }

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
      args.push('--format', 'bestaudio/best')
    } else {
      if (resolution && resolution !== 'best') {
        args.push('--format', `bestvideo[height<=${resolution}]+bestaudio/best`)
      } else {
        args.push('--format', 'bestvideo+bestaudio/best')
      }
    }

    args.push('--print', '%(filesize,filesize_approx)s')
    args.push(url)

    return new Promise((resolve) => {
      const proc = spawn(ytdlpPath, args, {
        windowsHide: true
      })

      let stdout = ''
      let settled = false

      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        proc.kill('SIGKILL')
        resolve('Unknown')
      }, 15000)

      proc.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      proc.on('close', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)

        if (code !== 0) {
          resolve('Unknown')
          return
        }

        const sizeStr = stdout.trim()
        if (sizeStr && sizeStr !== 'NA' && sizeStr !== 'None') {
          const bytes = parseInt(sizeStr, 10)
          if (!isNaN(bytes)) {
            const sizeMB = (bytes / (1024 * 1024)).toFixed(1)
            resolve(`${sizeMB} MiB`)
            return
          }
        }
        resolve('Unknown')
      })

      proc.on('error', () => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve('Unknown')
      })
    })
  }

  cancel(id: string, window: BrowserWindow): void {
    console.log(`[Downloader.cancel] Cancel requested for ID: ${id}`)

    // Direct file downloads are plain HTTP requests, not yt-dlp processes
    const fileInfo = this.activeFileDownloads.get(id)
    if (fileInfo) {
      fileInfo.cancelled = true
      fileInfo.req.destroy()
      setTimeout(() => {
        this.activeFileDownloads.delete(id)
        this.cleanupPartialFile(fileInfo.filePath)
      }, 500)
      this.settingsManager.removeHistoryItem(id)
      this.sendProgress(window, {
        id,
        percent: 0,
        speed: 'Cancelled',
        eta: '--:--',
        status: 'cancelled'
      })
      return
    }

    console.log(
      `[Downloader.cancel] Currently active IDs:`,
      Array.from(this.activeProcesses.keys())
    )

    const info = this.activeProcesses.get(id)
    if (info) {
      console.log(`[Downloader.cancel] Found active process for ID: ${id}, PID: ${info.proc.pid}`)
      this.killProcessTree(info.proc)

      this.activeProcesses.delete(id)

      // Auto delete partial files (torrents may leave a folder + .aria2 control file)
      setTimeout(() => {
        for (const filePath of info.filePaths) {
          try {
            if (fs.existsSync(filePath)) {
              fs.rmSync(filePath, { recursive: true, force: true })
              console.log(`Deleted cancelled download file: ${filePath}`)
            }
            for (const suffix of ['.part', '.ytdl', '.aria2']) {
              const extraPath = filePath + suffix
              if (fs.existsSync(extraPath)) {
                fs.unlinkSync(extraPath)
                console.log(`Deleted cancelled download ${suffix} file: ${extraPath}`)
              }
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
      // Paused torrents have no active process; clean up using the history record
      const historyItem = this.settingsManager.getSettings().history.find((h) => h.id === id)
      if (historyItem && historyItem.status === 'paused') {
        try {
          if (historyItem.filePath && fs.existsSync(historyItem.filePath)) {
            fs.rmSync(historyItem.filePath, { recursive: true, force: true })
          }
          const controlFile = historyItem.filePath + '.aria2'
          if (historyItem.filePath && fs.existsSync(controlFile)) {
            fs.unlinkSync(controlFile)
          }
        } catch (err) {
          console.error(`Failed to clean up paused download ${id}:`, err)
        }
        this.settingsManager.removeHistoryItem(id)
        this.sendProgress(window, {
          id,
          percent: 0,
          speed: 'Cancelled',
          eta: '--:--',
          status: 'cancelled'
        })
        return
      }
      console.warn(`[Downloader.cancel] No active process found for ID: ${id}`)
    }
  }

  // Pauses a torrent by killing aria2c while keeping the partial data and the
  // .aria2 control file on disk — re-running the same download resumes it.
  pause(id: string, window: BrowserWindow): void {
    const info = this.activeProcesses.get(id)
    if (!info || info.kind !== 'torrent') {
      console.warn(`[Downloader.pause] No pausable torrent found for ID: ${id}`)
      return
    }

    // Remove from the map first so the close handler treats the exit as
    // intentional instead of reporting a failure
    this.activeProcesses.delete(id)
    this.killProcessTree(info.proc)

    this.settingsManager.updateHistoryItemStatus(id, 'paused')
    this.sendProgress(window, {
      id,
      percent: info.lastPercent,
      speed: 'Paused',
      eta: '--:--',
      status: 'paused'
    })
  }

  private killProcessTree(proc: ChildProcess): void {
    const pid = proc.pid
    if (process.platform === 'win32' && pid) {
      try {
        const systemRoot = process.env.SystemRoot || 'C:\\Windows'
        const taskkillPath = path.join(systemRoot, 'System32', 'taskkill.exe')
        execSync(`"${taskkillPath}" /pid ${pid} /T /F`, { windowsHide: true })
      } catch (err) {
        console.error(`taskkill failed, falling back to process.kill:`, err)
        try {
          process.kill(pid, 'SIGKILL')
        } catch (e) {
          console.error(`process.kill fallback failed:`, e)
        }
      }
    } else {
      proc.kill('SIGKILL')
    }
  }

  private sendProgress(window: BrowserWindow, progress: DownloadProgress): void {
    if (!window.isDestroyed()) {
      window.webContents.send('download-progress', progress)
    }
  }
}
