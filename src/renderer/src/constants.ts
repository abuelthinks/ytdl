// Shared option lists used across the download form and the queue/settings UI.

export const RESOLUTION_OPTIONS = ['2160', '1440', '1080', '720', '480', '360', '240', '144']

export const CONCURRENCY_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export const DEFAULT_CONCURRENCY = 5

// Below this window width the app switches to the minimal UI
export const MINI_WIDTH_THRESHOLD = 560

// Extensions treated as direct file downloads (bypass yt-dlp).
// Media extensions (mp4, mp3, webm...) are excluded on purpose — yt-dlp
// handles direct media links fine and keeps them in the video/music folders.
const DIRECT_FILE_EXTENSIONS = [
  'pdf',
  'zip',
  'rar',
  '7z',
  'tar',
  'gz',
  'exe',
  'msi',
  'apk',
  'dmg',
  'iso',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'csv',
  'json',
  'epub',
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'svg'
]

export function isDirectFileUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase()
    return DIRECT_FILE_EXTENSIONS.some((ext) => pathname.endsWith(`.${ext}`))
  } catch {
    return false
  }
}

// Magnet links, .torrent URLs, and local .torrent file paths are all
// downloaded via the aria2 torrent engine
export function isTorrentUrl(url: string): boolean {
  if (url.startsWith('magnet:')) return true
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.torrent')
  } catch {
    // Not a URL — treat as a local file path (dropped .torrent file)
    return url.toLowerCase().endsWith('.torrent')
  }
}

export function torrentNameFromUrl(url: string): string {
  if (url.startsWith('magnet:')) {
    try {
      const query = url.slice(url.indexOf('?') + 1)
      const dn = new URLSearchParams(query).get('dn')
      if (dn) return dn
    } catch {
      // Fall through to the generic fallback
    }
    return 'Magnet download'
  }
  // URL pathname, or basename of a local file path
  const name = fileNameFromUrl(url) || url.split(/[\\/]/).pop() || ''
  return name.replace(/\.torrent$/i, '') || 'Torrent download'
}

export function fileNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const base = pathname.split('/').filter(Boolean).pop() || ''
    return decodeURIComponent(base)
  } catch {
    return ''
  }
}
