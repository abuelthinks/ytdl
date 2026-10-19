// Background service worker.
// All network calls to the local MyIDM app live here. Content scripts
// can't reach http://127.0.0.1 directly because the host page's CSP (connect-src)
// blocks it — the service worker is not subject to the page CSP, so it works.

const SERVER_ADDRESS = 'http://127.0.0.1:30123'

async function checkStatus() {
  try {
    const res = await fetch(`${SERVER_ADDRESS}/status`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2500)
    })
    if (!res.ok) return false
    const data = await res.json()
    return data.status === 'ok'
  } catch {
    return false
  }
}

// Cookies for the file URL (and the page that linked it) plus this browser's
// user agent let the app download as this browser session, like IDM does
async function getSession(payload) {
  const urls = [payload.url, payload.referer].filter((u) => /^https?:\/\//.test(u || ''))
  const lists = await Promise.all(urls.map((url) => chrome.cookies.getAll({ url })))
  const seen = new Set()
  const cookies = lists
    .flat()
    .filter((cookie) => {
      const key = `${cookie.domain}|${cookie.path}|${cookie.name}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map(({ name, value, domain, path, secure, hostOnly, expirationDate }) => ({
      name,
      value,
      domain,
      path,
      secure,
      hostOnly,
      expirationDate
    }))
  return { cookies, userAgent: navigator.userAgent }
}

async function sendDownload(payload) {
  const session = await getSession(payload).catch(() => ({}))
  const res = await fetch(`${SERVER_ADDRESS}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, ...session }),
    signal: AbortSignal.timeout(20000)
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `App responded with status ${res.status}`)
  }
  return data
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CHECK_STATUS') {
    checkStatus().then((connected) => sendResponse({ connected }))
    return true // keep the channel open for the async response
  }

  if (message.type === 'DOWNLOAD') {
    sendDownload(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: err.message }))
    return true
  }

  return false
})

// Browser download handoff: when enabled in the popup, every download the
// browser starts is cancelled and re-queued in the app instead.
// If the app isn't running or can't fetch the file itself, the browser keeps it.
async function isHandoffEnabled() {
  const { handoffDownloads } = await chrome.storage.local.get('handoffDownloads')
  return !!handoffDownloads
}

async function handOffDownload(item) {
  const url = item.finalUrl || item.url
  if (!/^https?:\/\//.test(url)) return false
  if (!(await isHandoffEnabled()) || !(await checkStatus())) return false

  try {
    const result = await sendDownload({
      url,
      title: item.filename.split(/[\\/]/).pop(),
      referer: item.referrer || undefined,
      format: 'file',
      probe: true
    })
    return !!result.success
  } catch {
    return false
  }
}

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  handOffDownload(item).then((handedOff) => {
    if (handedOff) {
      chrome.downloads.cancel(item.id, () => chrome.downloads.erase({ id: item.id }))
    } else {
      suggest()
    }
  })
  return true // suggest() is called asynchronously
})
