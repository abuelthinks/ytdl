import http from 'http'
import { AddressInfo } from 'net'
import { randomBytes } from 'crypto'
import { BrowserSession, browserFetch, headerValue } from './browser-fetch'

interface ProxyContext {
  referer?: string
  session?: BrowserSession
}

const PASSTHROUGH_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'last-modified',
  'etag'
]

// Loopback proxy that lets yt-dlp/ffmpeg fetch media through Chromium with the
// browser's session. HLS playlists are rewritten so every variant, segment and
// key URL also comes back through here. Each download gets its own token.
export class BrowserProxy {
  private server: http.Server | null = null
  private port = 0
  private contexts = new Map<string, ProxyContext>()

  async register(context: ProxyContext): Promise<string> {
    await this.ensureStarted()
    const token = randomBytes(16).toString('hex')
    this.contexts.set(token, context)
    return token
  }

  unregister(token: string): void {
    this.contexts.delete(token)
  }

  proxyUrl(token: string, target: string): string {
    let name = 'media'
    try {
      name = new URL(target).pathname.split('/').filter(Boolean).pop() || name
    } catch {
      // Keep the generic name
    }
    const encoded = Buffer.from(target).toString('base64url')
    return `http://127.0.0.1:${this.port}/${token}/${encoded}/${encodeURIComponent(name)}`
  }

  private ensureStarted(): Promise<void> {
    if (this.server) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this.handle(req, res)
      })
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        this.port = (server.address() as AddressInfo).port
        this.server = server
        resolve()
      })
    })
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const [, token, encoded] = (req.url || '').split('/')
    const context = token ? this.contexts.get(token) : undefined
    if (!context || !encoded) {
      res.writeHead(404)
      res.end()
      return
    }

    const target = Buffer.from(encoded, 'base64url').toString()
    const headers: Record<string, string> = {}
    if (req.headers.range) headers.Range = req.headers.range

    try {
      const upstream = await browserFetch(target, {
        referer: context.referer,
        session: context.session,
        headers,
        sendOrigin: true
      })
      const status = upstream.res.statusCode || 502
      const contentType = headerValue(upstream.res, 'content-type')
      const isPlaylist =
        /mpegurl/i.test(contentType) || /\.m3u8?$/i.test(new URL(upstream.finalUrl).pathname)

      if (isPlaylist && status >= 200 && status < 300) {
        const chunks: Buffer[] = []
        upstream.res.on('data', (chunk: Buffer) => chunks.push(chunk))
        upstream.res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8')
          const rewritten = body.trimStart().startsWith('#EXTM3U')
            ? this.rewritePlaylist(token, body, upstream.finalUrl)
            : body
          res.writeHead(status, { 'Content-Type': 'application/vnd.apple.mpegurl' })
          res.end(rewritten)
        })
        upstream.res.on('error', () => res.destroy())
        return
      }

      // Chromium already decoded any Content-Encoding, so the upstream length
      // would be wrong for the body we pass on
      const decoded = !!headerValue(upstream.res, 'content-encoding')
      const outHeaders: Record<string, string> = {}
      for (const name of PASSTHROUGH_HEADERS) {
        if (decoded && name === 'content-length') continue
        const value = headerValue(upstream.res, name)
        if (value) outHeaders[name] = value
      }
      res.writeHead(status, outHeaders)

      if (req.method === 'HEAD') {
        upstream.req.abort()
        res.end()
        return
      }

      let finished = false
      upstream.res.on('data', (chunk: Buffer) => res.write(chunk))
      upstream.res.on('end', () => {
        finished = true
        res.end()
      })
      upstream.res.on('error', () => res.destroy())
      res.on('close', () => {
        if (!finished) upstream.req.abort()
      })
    } catch (err) {
      if (!res.headersSent) res.writeHead(502)
      res.end(err instanceof Error ? err.message : 'Upstream request failed')
    }
  }

  private rewritePlaylist(token: string, body: string, baseUrl: string): string {
    const proxied = (uri: string): string => {
      try {
        const absolute = new URL(uri, baseUrl)
        return /^https?:$/.test(absolute.protocol) ? this.proxyUrl(token, absolute.toString()) : uri
      } catch {
        return uri
      }
    }

    return body
      .split(/\r?\n/)
      .map((line) => {
        const trimmed = line.trim()
        if (!trimmed) return line
        if (trimmed.startsWith('#')) {
          return line.replace(/URI="([^"]+)"/g, (_, uri: string) => `URI="${proxied(uri)}"`)
        }
        return proxied(trimmed)
      })
      .join('\n')
  }
}
