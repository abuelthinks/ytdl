import http from 'http'
import { BrowserWindow } from 'electron'
import { Downloader } from './downloader'

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

        req.on('end', () => {
          try {
            const data = JSON.parse(body)
            const { url, title, referer, format, resolution } = data

            if (!url) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'URL is required' }))
              return
            }

            const fmt: 'mp4' | 'mp3' | 'best' =
              format === 'mp4' || format === 'mp3' || format === 'best' ? format : 'best'
            const res_ = typeof resolution === 'string' && resolution ? resolution : 'best'

            const window = this.getMainWindow()
            if (!window) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Main window is not available' }))
              return
            }

            const id = `ext-${Date.now()}`
            // Honor the format/resolution sent by the extension, defaulting to best
            this.downloader.download(id, url, fmt, res_, window, title, referer).catch((err) => {
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
