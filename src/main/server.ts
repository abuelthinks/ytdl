import http from 'http'
import { BrowserWindow } from 'electron'
import { Downloader } from './downloader'
import { BrowserSession } from './browser-fetch'

export class LocalServer {
  private server: http.Server | null = null
  private downloader: Downloader
  private getMainWindow: () => BrowserWindow | null

  constructor(downloader: Downloader, getMainWindow: () => BrowserWindow | null) {
    this.downloader = downloader
    this.getMainWindow = getMainWindow
  }

  start(port = 30123): void {
    if (this.server) {
      console.warn('LocalServer is already running.')
      return
    }

    this.server = http.createServer((req, res) => {
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      if (req.method === 'GET' && req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok' }))
        return
      }

      if (req.method === 'POST' && req.url === '/download') {
        // Only the extension (or local tooling) may trigger downloads. Without
        // this, any website you visit could POST here and queue downloads on
        // your machine — CORS doesn't prevent the request, only reading the reply.
        if (!this.isOriginAllowed(req.headers.origin)) {
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Forbidden origin' }))
          return
        }

        let body = ''
        req.on('data', (chunk) => {
          body += chunk.toString()
        })

        req.on('end', async () => {
          try {
            const data = JSON.parse(body)
            const { url, title, referer, format, resolution, probe, cookies, userAgent } = data
            const session: BrowserSession = {
              cookies: Array.isArray(cookies) ? cookies : undefined,
              userAgent: typeof userAgent === 'string' ? userAgent : undefined
            }

            if (!url) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'URL is required' }))
              return
            }

            const fmt: 'mp4' | 'mp3' | 'best' | 'file' | 'torrent' =
              format === 'mp4' ||
              format === 'mp3' ||
              format === 'best' ||
              format === 'file' ||
              format === 'torrent'
                ? format
                : 'best'
            const res_ = typeof resolution === 'string' && resolution ? resolution : 'best'

            // Browser handoffs ask for a probe first so files the app can't fetch
            // (e.g. links tied to the browser's session) stay in the browser
            if (probe && fmt === 'file') {
              const status = await this.downloader.probeFile(url, referer, session)
              if (status < 200 || status >= 300) {
                res.writeHead(409, { 'Content-Type': 'application/json' })
                res.end(
                  JSON.stringify({
                    error: status ? `File host responded with status ${status}` : 'File unreachable'
                  })
                )
                return
              }
            }

            const window = this.getMainWindow()
            if (!window) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Main window is not available' }))
              return
            }

            // Bring the app forward so the new download is visible. Windows blocks
            // plain focus() from background apps, so briefly pin it on top.
            if (window.isMinimized()) window.restore()
            window.show()
            window.setAlwaysOnTop(true)
            window.focus()
            window.setAlwaysOnTop(false)

            const id = `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            // Honor the format/resolution sent by the extension, defaulting to best
            this.downloader
              .download(id, url, fmt, res_, window, title, referer, session)
              .catch((err) => {
                console.error(`LocalServer download error for ${id}:`, err)
                if (!window.isDestroyed()) {
                  window.webContents.send('download-progress', {
                    id,
                    percent: 0,
                    speed: 'Error',
                    eta: '--:--',
                    status: 'failed',
                    error: err.message
                  })
                }
              })

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, id }))
          } catch (err: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Invalid JSON payload', details: err.message }))
          }
        })
        return
      }

      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not Found' }))
    })

    this.server.listen(port, '127.0.0.1', () => {
      console.log(`LocalServer listening on http://127.0.0.1:${port}`)
    })
  }

  private isOriginAllowed(origin: string | undefined): boolean {
    // No Origin header (curl, some service-worker GETs) — allow.
    if (!origin) return true
    // Browser extensions are trusted senders.
    if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) {
      return true
    }
    // Local tooling on the loopback interface is fine.
    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)) {
      return true
    }
    // Anything else is a real website → reject to prevent drive-by downloads.
    return false
  }

  stop(): void {
    if (this.server) {
      this.server.close(() => {
        console.log('LocalServer stopped.')
      })
      this.server = null
    }
  }
}
