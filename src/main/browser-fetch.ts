import { net, session as electronSession, ClientRequest, IncomingMessage } from 'electron'

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

// Cookies + user agent of the browser that started a download, so the app can
// fetch files tied to that browser session (logins, Cloudflare clearance)
export interface BrowserCookie {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  hostOnly: boolean
  expirationDate?: number
}

export interface BrowserSession {
  cookies?: BrowserCookie[]
  userAgent?: string
}

const DOWNLOAD_PARTITION = 'ytdl-downloads'
const REFERER_HEADER = 'X-Ytdl-Referer'
const ORIGIN_HEADER = 'X-Ytdl-Origin'
let downloadSession: Electron.Session | null = null

// Requests go through Electron's Chromium network stack with the browser's
// cookies, so hosts that only serve real browser sessions accept them.
// Chromium won't let Referer/Origin be set directly, so they're swapped in here.
function getDownloadSession(): Electron.Session {
  if (!downloadSession) {
    downloadSession = electronSession.fromPartition(DOWNLOAD_PARTITION)
    downloadSession.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = details.requestHeaders
      if (headers[REFERER_HEADER]) {
        headers.Referer = headers[REFERER_HEADER]
        delete headers[REFERER_HEADER]
      }
      if (headers[ORIGIN_HEADER]) {
        headers.Origin = headers[ORIGIN_HEADER]
        delete headers[ORIGIN_HEADER]
      }
      callback({ requestHeaders: headers })
    })
  }
  return downloadSession
}

export async function openBrowserRequest(
  url: string,
  referer?: string,
  session?: BrowserSession,
  extraHeaders: Record<string, string> = {},
  sendOrigin = false
): Promise<ClientRequest> {
  const ses = getDownloadSession()
  await Promise.all(
    (session?.cookies || []).map((cookie) => {
      const domain = cookie.domain.replace(/^\./, '')
      return ses.cookies
        .set({
          url: `${cookie.secure ? 'https' : 'http'}://${domain}${cookie.path || '/'}`,
          name: cookie.name,
          value: cookie.value,
          ...(cookie.hostOnly ? {} : { domain: cookie.domain }),
          path: cookie.path || '/',
          secure: cookie.secure,
          ...(cookie.expirationDate ? { expirationDate: cookie.expirationDate } : {})
        })
        .catch(() => {})
    })
  )

  const req = net.request({ url, session: ses, useSessionCookies: true, redirect: 'manual' })
  req.setHeader('User-Agent', session?.userAgent || DEFAULT_USER_AGENT)
  if (referer) {
    req.setHeader(REFERER_HEADER, referer)
    if (sendOrigin) {
      try {
        req.setHeader(ORIGIN_HEADER, new URL(referer).origin)
      } catch {
        // Malformed referer — send it without an Origin header
      }
    }
  }
  for (const [name, value] of Object.entries(extraHeaders)) {
    req.setHeader(name, value)
  }
  return req
}

export function headerValue(res: IncomingMessage, name: string): string {
  const value = res.headers[name]
  return Array.isArray(value) ? value[0] || '' : value || ''
}

// Opens a request (following redirects) and resolves once response headers
// arrive, with the final URL so relative links in the body can be resolved.
export async function browserFetch(
  url: string,
  options: {
    referer?: string
    session?: BrowserSession
    headers?: Record<string, string>
    sendOrigin?: boolean
  } = {}
): Promise<{ req: ClientRequest; res: IncomingMessage; finalUrl: string }> {
  const req = await openBrowserRequest(
    url,
    options.referer,
    options.session,
    options.headers,
    options.sendOrigin
  )

  return new Promise((resolve, reject) => {
    let finalUrl = url
    let redirectsLeft = 10
    const timer = setTimeout(() => {
      req.abort()
      reject(new Error('Connection timed out'))
    }, 30000)

    req.on('redirect', (_status, _method, redirectUrl) => {
      if (redirectsLeft-- <= 0) {
        clearTimeout(timer)
        req.abort()
        reject(new Error('Too many redirects'))
        return
      }
      finalUrl = redirectUrl
      req.followRedirect()
    })
    req.on('response', (res) => {
      clearTimeout(timer)
      resolve({ req, res, finalUrl })
    })
    req.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    req.end()
  })
}
