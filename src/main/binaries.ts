import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import https from 'https'
import { exec, execSync } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface BinaryStatus {
  ytdlp: boolean
  ffmpeg: boolean
  needsDownload: boolean
}

export class BinaryManager {
  private binDir: string
  private ytdlpPath: string
  private ffmpegPath: string

  constructor() {
    // Save binaries to AppData/Local/ytdl-app/bin (or equivalent)
    this.binDir = path.join(app.getPath('userData'), 'bin')

    const isWin = process.platform === 'win32'

    this.ytdlpPath = path.join(this.binDir, isWin ? 'yt-dlp.exe' : 'yt-dlp')
    this.ffmpegPath = path.join(this.binDir, isWin ? 'ffmpeg.exe' : 'ffmpeg')
  }

  getBinDir(): string {
    return this.binDir
  }

  getYtdlpPath(): string {
    // Check system PATH first, then local bin folder
    if (this.isInSystemPath(process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')) {
      return process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
    }
    return this.ytdlpPath
  }

  getFfmpegPath(): string {
    // Check system PATH first, then local bin folder
    if (this.isInSystemPath(process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')) {
      return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    }
    return this.ffmpegPath
  }

  private isInSystemPath(cmd: string): boolean {
    try {
      const checkCmd = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`
      execSync(checkCmd, { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }

  getStatus(): BinaryStatus {
    const hasYtdlp =
      fs.existsSync(this.ytdlpPath) ||
      this.isInSystemPath(process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
    const hasFfmpeg =
      fs.existsSync(this.ffmpegPath) ||
      this.isInSystemPath(process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')

    return {
      ytdlp: hasYtdlp,
      ffmpeg: hasFfmpeg,
      needsDownload: !hasYtdlp || !hasFfmpeg
    }
  }

  async ensureDirectory(): Promise<void> {
    if (!fs.existsSync(this.binDir)) {
      await fs.promises.mkdir(this.binDir, { recursive: true })
    }
  }

  async downloadYtdlp(onProgress: (percent: number) => void): Promise<void> {
    await this.ensureDirectory()

    // Windows is primary, but add other platform URLs just in case
    let url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
    if (process.platform === 'darwin') {
      url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos'
    } else if (process.platform === 'linux') {
      url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'
    }

    await this.downloadWithProgress(url, this.ytdlpPath, onProgress)

    // Make executable on unix platforms
    if (process.platform !== 'win32') {
      fs.chmodSync(this.ytdlpPath, 0o755)
    }
  }

  async downloadFfmpeg(onProgress: (percent: number) => void): Promise<void> {
    await this.ensureDirectory()

    let url = ''
    const tempZip = path.join(this.binDir, 'ffmpeg.zip')

    if (process.platform === 'win32') {
      url =
        'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffmpeg-6.1-win-64.zip'
    } else if (process.platform === 'darwin') {
      url =
        'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffmpeg-6.1-osx-64.zip'
    } else {
      url =
        'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffmpeg-6.1-linux-64.zip'
    }

    // Download zip
    await this.downloadWithProgress(url, tempZip, onProgress)

    // Extract using tar (standard in Win 10/11 and unix)
    try {
      await execAsync(`tar -xf "${tempZip}" -C "${this.binDir}"`)
    } catch (err) {
      console.error('Extraction failed, attempting powershell fallback:', err)
      if (process.platform === 'win32') {
        await execAsync(
          `powershell -Command "Expand-Archive -Path '${tempZip}' -DestinationPath '${this.binDir}' -Force"`
        )
      } else {
        throw err
      }
    } finally {
      // Clean up temp zip
      if (fs.existsSync(tempZip)) {
        await fs.promises.unlink(tempZip)
      }
    }

    // Make executable on unix platforms
    if (process.platform !== 'win32') {
      fs.chmodSync(this.ffmpegPath, 0o755)
    }
  }

  private downloadWithProgress(
    url: string,
    dest: string,
    onProgress: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest)

      const fail = (err: Error): void => {
        file.close()
        // Delete unfinished file
        if (fs.existsSync(dest)) {
          fs.unlinkSync(dest)
        }
        reject(err)
      }

      const request = (targetUrl: string): void => {
        https
          .get(targetUrl, (response) => {
            // Handle redirects (drain the redirect response before re-requesting)
            if (response.statusCode === 301 || response.statusCode === 302) {
              if (response.headers.location) {
                response.resume()
                request(response.headers.location)
                return
              }
            }

            if (response.statusCode !== 200) {
              response.resume()
              fail(new Error(`Failed to download binary: HTTP ${response.statusCode}`))
              return
            }

            const totalBytes = parseInt(response.headers['content-length'] || '0', 10)
            let receivedBytes = 0

            // Pipe handles backpressure; the data listener only tracks progress.
            response.on('data', (chunk) => {
              receivedBytes += chunk.length
              if (totalBytes > 0) {
                onProgress(Math.round((receivedBytes / totalBytes) * 100))
              }
            })

            response.pipe(file)
            response.on('error', fail)
            file.on('error', fail)
            file.on('finish', () => {
              onProgress(100)
              resolve()
            })
          })
          .on('error', fail)
      }

      request(url)
    })
  }

  async getLocalYtdlpVersion(): Promise<string> {
    try {
      const ytdlpPath = this.getYtdlpPath()
      const isLocalFile = ytdlpPath.includes('/') || ytdlpPath.includes('\\')
      if (isLocalFile && !fs.existsSync(ytdlpPath)) {
        return ''
      }
      if (!isLocalFile && !this.isInSystemPath(ytdlpPath)) {
        return ''
      }

      const { stdout } = await execAsync(`"${ytdlpPath}" --version`)
      return stdout.trim()
    } catch (err) {
      console.error('Failed to get local yt-dlp version:', err)
      return ''
    }
  }

  async getLatestYtdlpVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
      const fetchUrl = (targetUrl: string): void => {
        try {
          const urlObj = new URL(targetUrl)
          const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
              'User-Agent': 'ytdl-app'
            }
          }

          https
            .get(options, (res) => {
              if (res.statusCode === 301 || res.statusCode === 302) {
                if (res.headers.location) {
                  fetchUrl(res.headers.location)
                  return
                }
              }

              if (res.statusCode !== 200) {
                reject(new Error(`GitHub API returned status code ${res.statusCode}`))
                return
              }

              let data = ''
              res.on('data', (chunk) => {
                data += chunk
              })
              res.on('end', () => {
                try {
                  const json = JSON.parse(data)
                  const version = json.tag_name
                  resolve(version)
                } catch (err) {
                  reject(err)
                }
              })
            })
            .on('error', reject)
        } catch (err) {
          reject(err)
        }
      }

      fetchUrl('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest')
    })
  }
}
