// Packer unpacker helper function
function unpack(p, a, c, k, e, d) {
  e = function (c) {
    return (
      (c < a ? '' : e(parseInt(c / a, 10))) +
      ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36))
    )
  }
  if (!''.replace(/^/, String)) {
    while (c--) d[e(c)] = k[c] || e(c)
    k = [
      function (e) {
        return d[e]
      }
    ]
    e = function () {
      return '\\w+'
    }
    c = 1
  }
  while (c--) {
    if (k[c]) p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c])
  }
  return p
}

const BUTTON_CONTAINER_ID = 'ytdl-helper-container'

// Runs in every frame (all_frames) so players inside iframes — like kwik on
// animepahe — are reachable. Identity comparison with window.top is allowed
// even cross-origin.
const IS_FRAME = window.top !== window.self

// Small iframes are usually ads or widgets — don't auto-mount UI in them
// (they can still answer popup extraction queries)
function frameTooSmallForButton() {
  return IS_FRAME && (window.innerWidth < 400 || window.innerHeight < 200)
}

function cleanTitle() {
  return document.title.replace(/\s*-\s*Kwik\s*$/i, '').trim()
}

// Make room so media manifests aren't dropped from the resource timing log
// on resource-heavy pages (default buffer is only ~250 entries)
try {
  performance.setResourceTimingBufferSize(2000)
} catch {
  // older engines — the default buffer will have to do
}

// Strongest universal signal: whatever the player actually fetched over the
// network. Works regardless of how the page obfuscates its code.
function mediaUrlFromResources() {
  let entries = []
  try {
    entries = performance.getEntriesByType('resource')
  } catch {
    return ''
  }
  // Streaming manifests first — the earliest one is usually the master playlist
  for (const entry of entries) {
    if (/\.(m3u8|mpd)(\?|#|$)/i.test(entry.name)) return entry.name
  }
  // Otherwise the most recent progressive media file
  for (let i = entries.length - 1; i >= 0; i--) {
    if (/\.(mp4|webm|m4v|mov)(\?|#|$)/i.test(entries[i].name)) return entries[i].name
  }
  return ''
}

// Player configs often carry the stream URL in plain inline JS
// (jwplayer, plyr, videojs setups: file:/source:/src: "https://...m3u8")
function mediaUrlFromScripts() {
  const pattern =
    /(?:file|source|src)\s*[:=]\s*\\?["'](https?:[^"'\\\s]+?\.(?:m3u8|mpd|mp4|webm)[^"'\\\s]*)/i
  for (const script of document.querySelectorAll('script')) {
    const match = (script.textContent || '').match(pattern)
    if (match) return match[1]
  }
  return ''
}

// Last resort: nudge the player into loading (a click on our button counts as
// a user gesture, so play() is allowed) and watch for the stream to surface
// either on the <video> element or in the network log.
function sniffVideoUrl(timeoutMs) {
  return new Promise((resolve) => {
    const video = pickLargestVideo()
    let startedByUs = false
    if (video && video.paused) {
      const playing = video.play()
      if (playing && playing.catch) playing.catch(() => {})
      startedByUs = true
    }

    const startedAt = Date.now()
    const finish = (url) => {
      clearInterval(interval)
      if (startedByUs && video && !video.paused) video.pause()
      resolve(url || null)
    }

    const interval = setInterval(() => {
      const current = pickLargestVideo()
      const direct = current ? directVideoSrc(current) : ''
      if (direct) {
        finish(direct)
        return
      }
      const network = mediaUrlFromResources()
      if (network) {
        finish(network)
        return
      }
      if (Date.now() - startedAt > timeoutMs) finish(null)
    }, 500)
  })
}

function directVideoSrc(video) {
  const candidates = [video.currentSrc, video.src]
  for (const source of video.querySelectorAll('source')) {
    candidates.push(source.src)
  }
  // blob:/mediasource URLs can't be downloaded outside the page — skip them
  return candidates.find((src) => src && /^https?:/i.test(src)) || ''
}

function pickLargestVideo() {
  let best = null
  let bestArea = -1
  for (const video of document.querySelectorAll('video')) {
    const area = video.offsetWidth * video.offsetHeight
    if (area > bestArea) {
      best = video
      bestArea = area
    }
  }
  return best
}

// Heuristic to avoid triggering on tiny background/decoration videos
function looksLikeRealVideo(video) {
  if (!video) return false
  if (video.controls) return true
  if (video.offsetWidth >= 200 && video.offsetHeight >= 112) return true
  return Number.isFinite(video.duration) && video.duration > 30
}

// Site-specific extractors get first pick (faster / more reliable than the
// generic path on players that hide the real stream URL).
const siteExtractors = [
  {
    name: 'kwik',
    match: () => /(^|\.)kwik\.(cx|si|li)$/.test(window.location.hostname),
    mountTarget: () => document.getElementById('player') || document.querySelector('.card'),
    getVideoInfo: async () => {
      // Strategy 1: Parse inline packed scripts (Fastest, doesn't require player interaction)
      const packedMarker =
        /eval\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*[a-z]\s*\)/i
      const scripts = document.querySelectorAll('script')
      for (const script of scripts) {
        const text = script.textContent || ''
        if (packedMarker.test(text)) {
          try {
            // Match the arguments of the eval call:
            //   }('<p>', <a>, <c>, '<k>'.split('<delim>'), ...)
            const argRegex =
              /}\s*\(\s*(['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\5\s*\.split\(\s*(['"])([^'"]+)\7\s*\)/
            const match = text.match(argRegex)
            if (match) {
              const p = match[2]
              const a = parseInt(match[3], 10)
              const c = parseInt(match[4], 10)
              const k = match[6].split(match[8])

              const unpacked = unpack(p, a, c, k, 0, {})
              const urlRegex = /source\s*[:=]\s*\\?['"](https?:\/\/[^'"\\]+)/
              const urlMatch = unpacked.match(urlRegex)

              if (urlMatch && urlMatch[1]) {
                console.log('[YTDL Helper] Extracted URL from script:', urlMatch[1])
                return {
                  url: urlMatch[1],
                  title: cleanTitle(),
                  referer: window.location.href
                }
              }
            }
          } catch (err) {
            console.error('[YTDL Helper] Error parsing packed script:', err)
          }
        }
      }

      // Strategy 2: whatever the player fetched over the network, or a stream
      // URL sitting in plain inline JS
      const known = mediaUrlFromResources() || mediaUrlFromScripts()
      if (known) {
        console.log('[YTDL Helper] Extracted URL from page resources:', known)
        return { url: known, title: cleanTitle(), referer: window.location.href }
      }

      // Strategy 3: kick the player and watch for the stream to surface
      const sniffed = await sniffVideoUrl(10000)
      if (sniffed) {
        console.log('[YTDL Helper] Extracted URL by sniffing playback:', sniffed)
        return { url: sniffed, title: cleanTitle(), referer: window.location.href }
      }

      return null
    }
  }
]

// Sites yt-dlp natively supports get the page URL directly — its own
// extractors beat in-page sniffing on quality options and metadata there
const YTDLP_NATIVE_HOSTS =
  /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|twitter\.com|x\.com|tiktok\.com|instagram\.com|facebook\.com|twitch\.tv|reddit\.com|dailymotion\.com|soundcloud\.com|bilibili\.com)$/i

// Generic fallback: any page with a real video player.
// Direct file sources are sent as-is (with referer, for hotlink-protected CDNs);
// obfuscated players are sniffed via the network log; big yt-dlp-supported
// sites just send the page URL.
const genericExtractor = {
  name: 'generic',
  match: () => true,
  mountTarget: () => null,
  getVideoInfo: async () => {
    if (YTDLP_NATIVE_HOSTS.test(window.location.hostname)) {
      return { url: window.location.href, title: cleanTitle() }
    }

    const video = pickLargestVideo()
    const direct = video ? directVideoSrc(video) : ''
    if (direct && direct !== window.location.href) {
      return { url: direct, title: cleanTitle(), referer: window.location.href }
    }

    const sniffed = mediaUrlFromResources() || mediaUrlFromScripts() || (await sniffVideoUrl(8000))
    if (sniffed) {
      return { url: sniffed, title: cleanTitle(), referer: window.location.href }
    }

    // Nothing surfaced in-page — let yt-dlp try the page URL itself
    return { url: window.location.href, title: cleanTitle() }
  }
}

function mountButton(extractor, onDownloadClick, onDismiss) {
  if (document.getElementById(BUTTON_CONTAINER_ID)) return null

  const target = extractor.mountTarget()

  const container = document.createElement('div')
  container.id = BUTTON_CONTAINER_ID
  container.style.cssText = `
    margin: 15px auto;
    max-width: 800px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 6px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  `

  const button = document.createElement('button')
  button.id = 'ytdl-download-btn'
  button.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
    color: white;
    border: none;
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 600;
    border-radius: 8px;
    cursor: pointer;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    transition: all 0.2s ease;
    opacity: 0.7;
  `
  button.disabled = true

  // Status indicator dot
  const indicator = document.createElement('span')
  indicator.style.cssText = `
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #ef4444;
    display: inline-block;
    box-shadow: 0 0 8px #ef4444;
  `

  const textNode = document.createTextNode('Checking YTDL App Connection...')

  button.appendChild(indicator)
  button.appendChild(textNode)
  container.appendChild(button)

  // Small dismiss control so the floating button never gets in the way
  const dismiss = document.createElement('button')
  dismiss.textContent = '✕'
  dismiss.title = 'Hide YTDL button'
  dismiss.style.cssText = `
    background: rgba(15, 23, 42, 0.75);
    color: #cbd5e1;
    border: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    font-size: 10px;
    line-height: 1;
    cursor: pointer;
    flex-shrink: 0;
  `
  dismiss.addEventListener('click', () => {
    container.remove()
    if (onDismiss) onDismiss()
  })
  container.appendChild(dismiss)

  if (!target || !target.parentNode) {
    // Floating style when the page has no known container to anchor to
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    `
    document.body.appendChild(container)
  } else {
    // Insert right after the target element
    target.parentNode.insertBefore(container, target.nextSibling)
  }

  button.addEventListener('click', onDownloadClick)

  // Return a control function to update state
  return {
    updateStatus: (isConnected) => {
      button.disabled = !isConnected
      if (isConnected) {
        button.style.opacity = '1'
        button.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
        indicator.style.backgroundColor = '#10b981'
        indicator.style.boxShadow = '0 0 8px #10b981'
        textNode.textContent = 'Download in YTDL App'
      } else {
        button.style.opacity = '0.7'
        button.style.background = 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)'
        indicator.style.backgroundColor = '#ef4444'
        indicator.style.boxShadow = '0 0 8px #ef4444'
        textNode.textContent = 'Open YTDL App to Download'
      }
    },
    updateLoading: (message) => {
      button.disabled = true
      button.style.opacity = '0.8'
      indicator.style.backgroundColor = '#f59e0b'
      indicator.style.boxShadow = '0 0 8px #f59e0b'
      textNode.textContent = message || 'Processing...'
    }
  }
}

function start(extractor) {
  console.log('[YTDL Helper] Active extractor:', extractor.name)

  let controls = null
  let serverConnected = false
  let pollTimer = null

  const checkConnection = async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'CHECK_STATUS' })
      serverConnected = !!(res && res.connected)
    } catch {
      serverConnected = false
    }

    if (controls) {
      controls.updateStatus(serverConnected)
    }
  }

  // Trigger download function
  const handleDownload = async () => {
    if (!serverConnected) return

    if (controls) {
      controls.updateLoading('Extracting Link...')
    }

    const info = await extractor.getVideoInfo()
    if (!info) {
      alert(
        'Could not find a downloadable video on this page.\n' +
          'If the video has not started yet, press Play, let it run a moment, then try again.'
      )
      if (controls) controls.updateStatus(serverConnected)
      return
    }

    if (controls) {
      controls.updateLoading('Sending to YTDL App...')
    }

    try {
      const response = await chrome.runtime.sendMessage({ type: 'DOWNLOAD', payload: info })

      if (response && response.ok && response.result && response.result.success) {
        if (controls) {
          controls.updateLoading('Download Started!')
          setTimeout(() => {
            controls.updateStatus(serverConnected)
          }, 2000)
        }
      } else {
        const errMsg =
          (response && (response.error || (response.result && response.result.error))) ||
          'Unknown error'
        alert('Failed to start download: ' + errMsg)
        if (controls) controls.updateStatus(serverConnected)
      }
    } catch (err) {
      alert('Error sending command to YTDL App: ' + err.message)
      if (controls) controls.updateStatus(serverConnected)
    }
  }

  // Inject UI (with a dismiss control that stops the connection polling)
  controls = mountButton(extractor, handleDownload, () => {
    if (pollTimer) clearInterval(pollTimer)
    controls = null
  })
  if (!controls) return

  // Poll connection status, skipping background tabs
  checkConnection()
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') {
      checkConnection()
    }
  }, 3000)
}

// Main logic
function init() {
  const site = siteExtractors.find((e) => e.match())
  if (site) {
    start(site)
    return
  }

  // Generic mode: only surface the button once a plausible video player exists,
  // so ordinary pages never get UI injected into them.
  let observer = null
  let debounceTimer = null

  const tryDetect = () => {
    if (frameTooSmallForButton()) return false
    const video = pickLargestVideo()
    if (video && looksLikeRealVideo(video)) {
      if (observer) observer.disconnect()
      document.removeEventListener('loadedmetadata', scheduleDetect, true)
      document.removeEventListener('play', scheduleDetect, true)
      start(genericExtractor)
      return true
    }
    return false
  }

  const scheduleDetect = () => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(tryDetect, 600)
  }

  if (tryDetect()) return

  observer = new MutationObserver(scheduleDetect)
  // Attributes matter too: players often mount a tiny/hidden <video> first and
  // only later set src/controls or grow it to player size
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'controls', 'class', 'style', 'width', 'height']
  })
  document.addEventListener('loadedmetadata', scheduleDetect, true)
  document.addEventListener('play', scheduleDetect, true)
}

// Popup extraction relay: the popup asks every frame in the tab for video info,
// and whichever frame actually holds the player answers. This is how pages that
// bury the video in an iframe (animepahe → kwik) work from the popup button.
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== 'GET_PAGE_VIDEO') return false

    const site = siteExtractors.find((e) => e.match())
    if (site) {
      site
        .getVideoInfo()
        .then((info) => sendResponse(info || null))
        .catch(() => sendResponse(null))
      return true // async response
    }

    // Generic frames only answer when they hold a plausible player, so silent
    // frames don't shadow the one with the real video
    const video = pickLargestVideo()
    if (!video || !looksLikeRealVideo(video)) return false

    genericExtractor
      .getVideoInfo()
      .then((info) => sendResponse(info || null))
      .catch(() => sendResponse(null))
    return true
  })
}

// Run the script
init()
