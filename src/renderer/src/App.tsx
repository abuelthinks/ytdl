import React, { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import BinaryStatusModal from './components/BinaryStatusModal'
import DownloadQueue from './components/DownloadQueue'
import PasteBox from './components/PasteBox'
import MiniView from './components/MiniView'
import TitleBar, { AppMode, TabId, Theme } from './components/TitleBar'
import StatusBar from './components/StatusBar'
import SettingsTab from './components/SettingsTab'
import HistoryList, { HistoryItem } from './components/HistoryList'
import { DownloadProgress } from '../../main/downloader'
import { AppSettings } from './types'
import {
  DEFAULT_CONCURRENCY,
  MINI_WIDTH_THRESHOLD,
  isDirectFileUrl,
  fileNameFromUrl,
  isTorrentUrl,
  torrentNameFromUrl
} from './constants'

export default function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('download')
  const [dockSide, setDockSide] = useState<'left' | 'right' | null>(null)
  const [isMiniSize, setIsMiniSize] = useState<boolean>(window.innerWidth < MINI_WIDTH_THRESHOLD)
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('theme') as Theme) || 'system'
  )
  const [urlInput, setUrlInput] = useState('')
  const [format, setFormat] = useState<'mp4' | 'mp3' | 'file'>('mp4')
  const [resolution, setResolution] = useState<string>('1080')
  const [isFetchingInfo, setIsFetchingInfo] = useState<boolean>(false)

  // Keep current format/resolution readable inside the URL-watch effect without
  // making it re-run (and re-fetch video info) every time they change.
  const formatRef = useRef(format)
  const resolutionRef = useRef(resolution)
  useEffect(() => {
    formatRef.current = format
  }, [format])
  useEffect(() => {
    resolutionRef.current = resolution
  }, [resolution])

  // App initialization state
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  const [settings, setSettings] = useState<AppSettings>({
    downloadDir: '',
    downloadDirVideo: '',
    downloadDirMusic: '',
    downloadDirFiles: '',
    lastFormat: 'mp4',
    lastResolution: '1080',
    proxy: '',
    history: [],
    maxConcurrentDownloads: DEFAULT_CONCURRENCY
  })
  const [queue, setQueue] = useState<DownloadProgress[]>([])

  const [ytdlVersionInfo, setYtdlVersionInfo] = useState<{
    current: string
    latest: string
    updateAvailable: boolean
  } | null>(null)
  const [isCheckingUpdates, setIsCheckingUpdates] = useState<boolean>(false)
  const [isUpdatingYtdlp, setIsUpdatingYtdlp] = useState<boolean>(false)
  const [ytdlpUpdatePercent, setYtdlpUpdatePercent] = useState<number>(0)

  const hasOngoingDownloads = queue.some((item) => ['downloading', 'merging'].includes(item.status))
  const activeCount = queue.filter((item) =>
    ['downloading', 'merging'].includes(item.status)
  ).length

  const mode: AppMode = dockSide ? 'dock' : isMiniSize ? 'mini' : 'full'

  // Apply light/dark theme to the document root
  useEffect(() => {
    localStorage.setItem('theme', theme)
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const dark = theme === 'dark' || (theme === 'system' && mql.matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    mql.addEventListener('change', apply)
    return () => mql.removeEventListener('change', apply)
  }, [theme])

  const cycleTheme = (): void => {
    setTheme((prev) => (prev === 'system' ? 'light' : prev === 'light' ? 'dark' : 'system'))
  }

  // Switch to mini mode when the window is resized small
  useEffect(() => {
    const onResize = (): void => setIsMiniSize(window.innerWidth < MINI_WIDTH_THRESHOLD)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Global paste: pasting a link anywhere (outside an input) adds it to the queue
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const text = e.clipboardData?.getData('text')?.trim()
      if (
        text &&
        (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('magnet:'))
      ) {
        setUrlInput(text)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  // Global drop: accept .torrent files dropped anywhere in the window, and
  // stop Electron from navigating to the dropped file
  useEffect(() => {
    const onDragOver = (e: DragEvent): void => {
      e.preventDefault()
    }
    const onDrop = (e: DragEvent): void => {
      e.preventDefault()
      const file = e.dataTransfer?.files?.[0]
      if (file && file.name.toLowerCase().endsWith('.torrent')) {
        const filePath = window.api?.getFilePath ? window.api.getFilePath(file) : file.name
        if (filePath) {
          setUrlInput(filePath)
        }
      }
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  const handleDock = async (side: 'left' | 'right' | null): Promise<void> => {
    if (window.api?.setDockMode) {
      await window.api.setDockMode(side)
    }
    setDockSide(side)
  }

  const handleExpandWindow = (): void => {
    if (window.api?.windowExpand) {
      window.api.windowExpand()
    } else {
      setIsMiniSize(false)
    }
  }

  const handleMiniMode = (): void => {
    if (window.api?.windowSetMini) {
      window.api.windowSetMini()
    } else {
      setIsMiniSize(true)
    }
  }

  // Load configuration and check binary health on mount
  useEffect(() => {
    checkBinaryStatus()
    loadAppSettings()
    triggerUpdateCheck()

    let unsubscribeProgress: (() => void) | undefined
    let unsubscribeBinaryStatus: (() => void) | undefined

    if (window.api) {
      unsubscribeProgress = window.api.onDownloadProgress((data: DownloadProgress) => {
        setQueue((prevQueue) => {
          const currentItem = prevQueue.find((item) => item.id === data.id)

          if (currentItem) {
            // Ignore stray downloading/merging events if the item has been cancelled/reset to ready or is still queued
            if (
              ['ready', 'queued'].includes(currentItem.status) &&
              ['downloading', 'merging'].includes(data.status)
            ) {
              return prevQueue
            }
          }

          if (['completed', 'failed', 'cancelled'].includes(data.status)) {
            if (data.status === 'completed') {
              toast.success(`Download finished: ${data.fileName || 'file'}`)
              loadAppSettings()
              return prevQueue.filter((item) => item.id !== data.id)
            } else {
              if (data.status === 'failed') {
                toast.error(
                  data.error
                    ? `Download failed: ${data.error}`
                    : 'Download failed. Check details in history.'
                )
              }
              loadAppSettings()
              return prevQueue.map((item) =>
                item.id === data.id
                  ? {
                      ...item,
                      status: 'ready' as const,
                      percent: 0,
                      speed: '',
                      eta: ''
                    }
                  : item
              )
            }
          }

          const exists = prevQueue.some((item) => item.id === data.id)
          if (exists) {
            return prevQueue.map((item) => (item.id === data.id ? { ...item, ...data } : item))
          } else {
            return [...prevQueue, data]
          }
        })
      })

      unsubscribeBinaryStatus = window.api.onBinaryStatusUpdate((data) => {
        if (data.name === 'yt-dlp' && data.status === 'downloading') {
          setYtdlpUpdatePercent(data.percent)
        }
      })
    }

    return () => {
      if (unsubscribeProgress) {
        unsubscribeProgress()
      }
      if (unsubscribeBinaryStatus) {
        unsubscribeBinaryStatus()
      }
    }
  }, [])

  // Background task to fetch file sizes for queued items
  useEffect(() => {
    if (!window.api || !window.api.getFileSize) return

    // Find items that need their size calculated
    const itemsToFetch = queue.filter(
      (item) => item.status === 'ready' && item.fileSize === undefined
    )

    if (itemsToFetch.length === 0) return

    // Mark them as calculating first to prevent duplicate trigger loops
    setQueue((prev) =>
      prev.map((q) => {
        const found = itemsToFetch.find((item) => item.id === q.id)
        if (found) {
          return { ...q, fileSize: 'Calculating size...' }
        }
        return q
      })
    )

    // Run parallel calls to get size
    itemsToFetch.forEach(async (item) => {
      try {
        const size = await window.api.getFileSize({
          url: item.url || '',
          format: item.format || 'mp4',
          resolution: item.resolution || '1080'
        })
        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, fileSize: size || 'Unknown' } : q))
        )
      } catch (err) {
        console.error('Failed to fetch file size:', err)
        setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, fileSize: 'Unknown' } : q)))
      }
    })
  }, [queue])

  // Dynamically fetch video info when the URL changes
  useEffect(() => {
    const trimmed = urlInput.trim()
    if (
      !trimmed ||
      (!trimmed.startsWith('http://') &&
        !trimmed.startsWith('https://') &&
        !trimmed.startsWith('magnet:') &&
        !trimmed.toLowerCase().endsWith('.torrent'))
    ) {
      return
    }

    const timer = setTimeout(async () => {
      setIsFetchingInfo(true)
      try {
        const timestamp = Date.now()
        const formatToUse = formatRef.current
        const resToUse = formatToUse === 'mp4' ? resolutionRef.current : 'best'

        // Magnet links and .torrent URLs go to the torrent engine
        if (isTorrentUrl(trimmed)) {
          const name = torrentNameFromUrl(trimmed)
          const torrentItem: DownloadProgress = {
            id: `${timestamp}-0`,
            percent: 0,
            speed: '',
            eta: '',
            status: 'ready',
            url: trimmed,
            format: 'torrent',
            resolution: 'best',
            title: name,
            fileName: name
          }
          setQueue((prev) => [...prev, torrentItem])
          setUrlInput('')
          return
        }

        // Direct file links skip yt-dlp entirely — queue them as plain downloads
        if (formatToUse === 'file' || isDirectFileUrl(trimmed)) {
          const name = fileNameFromUrl(trimmed) || 'Direct file'
          const fileItem: DownloadProgress = {
            id: `${timestamp}-0`,
            percent: 0,
            speed: '',
            eta: '',
            status: 'ready',
            url: trimmed,
            format: 'file',
            resolution: 'best',
            title: name,
            fileName: name
          }
          setQueue((prev) => [...prev, fileItem])
          setUrlInput('')
          return
        }

        if (window.api && window.api.getVideoInfo) {
          const infos = await window.api.getVideoInfo(trimmed)

          const newItems = infos.map((info, idx) => {
            const downloadId = `${timestamp}-${idx}`
            return {
              id: downloadId,
              percent: 0,
              speed: '',
              dashSpeed: '',
              eta: '',
              status: 'ready' as const,
              url: info.url,
              format: formatToUse,
              resolution: resToUse,
              title: info.title,
              thumbnail: info.thumbnail,
              uploader: info.uploader,
              duration: info.duration,
              fileName: info.title + (formatToUse === 'mp3' ? '.mp3' : '.mp4')
            }
          })

          setQueue((prev) => [...prev, ...newItems])
          setUrlInput('')
        } else {
          // Simulated Preview in Browser Preview
          const isPlaylist = trimmed.includes('list=') && !trimmed.includes('v=')

          if (isPlaylist) {
            const newItems = [
              {
                id: `${timestamp}-0`,
                percent: 0,
                speed: '',
                dashSpeed: '',
                eta: '',
                status: 'ready' as const,
                url: trimmed + '&index=1',
                format: formatToUse,
                resolution: resToUse,
                title: 'Playlist Video 1 - Rick Astley',
                thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
                uploader: 'Rick Astley',
                duration: 212,
                fileName:
                  'Playlist Video 1 - Rick Astley' + (formatToUse === 'mp3' ? '.mp3' : '.mp4')
              },
              {
                id: `${timestamp}-1`,
                percent: 0,
                speed: '',
                dashSpeed: '',
                eta: '',
                status: 'ready' as const,
                url: trimmed + '&index=2',
                format: formatToUse,
                resolution: resToUse,
                title: 'Playlist Video 2 - Together Forever',
                thumbnail: 'https://img.youtube.com/vi/yPYZpwSpKmA/maxresdefault.jpg',
                uploader: 'Rick Astley',
                duration: 204,
                fileName:
                  'Playlist Video 2 - Together Forever' + (formatToUse === 'mp3' ? '.mp3' : '.mp4')
              }
            ]
            setQueue((prev) => [...prev, ...newItems])
          } else {
            const newItem: DownloadProgress = {
              id: `${timestamp}-0`,
              percent: 0,
              speed: '',
              eta: '',
              status: 'ready',
              url: trimmed,
              format: formatToUse,
              resolution: resToUse,
              title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)',
              thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
              uploader: 'Rick Astley',
              duration: 212,
              fileName:
                'Rick Astley - Never Gonna Give You Up (Official Music Video)' +
                (formatToUse === 'mp3' ? '.mp3' : '.mp4')
            }
            setQueue((prev) => [...prev, newItem])
          }
          setUrlInput('')
        }
      } catch (err: any) {
        console.error('Failed to fetch video details:', err)
        toast.error('Failed to load video info. Check link and try again.')
      } finally {
        setIsFetchingInfo(false)
      }
    }, 800)

    return () => clearTimeout(timer)
  }, [urlInput])

  // Concurrency Queue Worker
  useEffect(() => {
    const activeCount = queue.filter(
      (item) => item.status === 'downloading' || item.status === 'merging'
    ).length

    const maxConcurrent = settings.maxConcurrentDownloads || DEFAULT_CONCURRENCY

    if (activeCount < maxConcurrent) {
      const nextItem = queue.find((item) => item.status === 'queued')
      if (nextItem) {
        startDownloadProcess(
          nextItem.id,
          nextItem.url || '',
          nextItem.format || 'mp4',
          nextItem.resolution || '1080',
          nextItem.title
        )
      }
    }
  }, [queue, settings.maxConcurrentDownloads])

  const handleFormatChange = async (newFormat: 'mp4' | 'mp3' | 'file'): Promise<void> => {
    setFormat(newFormat)
    if (window.api) {
      const updated = await window.api.updateSettings({ lastFormat: newFormat })
      setSettings(updated)
    }
    // File mode only affects new pastes; parsed video items keep their format
    if (newFormat === 'file') return
    setQueue((prev) =>
      prev.map((item) =>
        item.status === 'ready' && item.format !== 'file' && item.format !== 'torrent'
          ? {
              ...item,
              format: newFormat,
              resolution: newFormat === 'mp3' ? 'best' : resolution
            }
          : item
      )
    )
  }

  const handleResolutionChange = async (newRes: string): Promise<void> => {
    setResolution(newRes)
    if (window.api) {
      const updated = await window.api.updateSettings({ lastResolution: newRes })
      setSettings(updated)
    }
    setQueue((prev) =>
      prev.map((item) =>
        item.status === 'ready' && item.format !== 'file' && item.format !== 'torrent'
          ? {
              ...item,
              resolution: newRes
            }
          : item
      )
    )
  }

  const handleConcurrencyChange = async (limit: number): Promise<void> => {
    if (window.api) {
      const updated = await window.api.updateSettings({ maxConcurrentDownloads: limit })
      setSettings(updated)
    } else {
      setSettings((prev) => ({ ...prev, maxConcurrentDownloads: limit }))
    }
  }

  const checkBinaryStatus = async (): Promise<void> => {
    if (!window.api) {
      setNeedsSetup(false)
      return
    }
    const status = await window.api.checkBinaries()
    setNeedsSetup(status.needsDownload)
  }

  const loadAppSettings = async (): Promise<void> => {
    if (!window.api) {
      setSettings((prev) => {
        const nextSettings = {
          ...prev,
          downloadDir: prev.downloadDir || 'C:\\Users\\User\\Downloads',
          downloadDirVideo: prev.downloadDirVideo || 'C:\\Users\\User\\Downloads\\Video',
          downloadDirMusic: prev.downloadDirMusic || 'C:\\Users\\User\\Downloads\\Music',
          downloadDirFiles: prev.downloadDirFiles || 'C:\\Users\\User\\Downloads\\Files',
          lastFormat: prev.lastFormat || 'mp4',
          lastResolution: prev.lastResolution || '1080',
          proxy: prev.proxy || '',
          history:
            prev.history.length > 0
              ? prev.history
              : [
                  {
                    id: 'demo-1',
                    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                    title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)',
                    fileName: 'Rick Astley - Never Gonna Give You Up.mp4',
                    filePath:
                      'C:\\Users\\User\\Downloads\\Rick Astley - Never Gonna Give You Up.mp4',
                    fileSize: '14.28 MiB',
                    date: new Date().toLocaleString(),
                    format: 'mp4' as const,
                    status: 'completed' as const
                  }
                ]
        }
        setFormat(nextSettings.lastFormat)
        setResolution(nextSettings.lastResolution)
        return nextSettings
      })
      return
    }
    const appSettings = await window.api.getSettings()
    setSettings(appSettings)
    if (appSettings.lastFormat) {
      setFormat(appSettings.lastFormat)
    }
    if (appSettings.lastResolution) {
      setResolution(appSettings.lastResolution)
    }
  }

  const triggerUpdateCheck = async (): Promise<void> => {
    setIsCheckingUpdates(true)
    if (!window.api) {
      setTimeout(() => {
        setYtdlVersionInfo({
          current: '2024.04.15',
          latest: '2024.05.27',
          updateAvailable: true
        })
        setIsCheckingUpdates(false)
      }, 1000)
      return
    }

    try {
      const res = await window.api.checkYtdlUpdates()
      setYtdlVersionInfo(res)
    } catch (err) {
      console.error('Failed to check for updates:', err)
    } finally {
      setIsCheckingUpdates(false)
    }
  }

  const handleUpdateYtdlp = async (): Promise<void> => {
    if (!window.api) {
      setIsUpdatingYtdlp(true)
      setYtdlpUpdatePercent(0)
      const interval = setInterval(() => {
        setYtdlpUpdatePercent((prev) => {
          if (prev >= 100) {
            clearInterval(interval)
            setIsUpdatingYtdlp(false)
            setYtdlVersionInfo((info) =>
              info ? { ...info, current: info.latest, updateAvailable: false } : null
            )
            toast.success('yt-dlp updated successfully!')
            return 100
          }
          return prev + 20
        })
      }, 500)
      return
    }

    setIsUpdatingYtdlp(true)
    setYtdlpUpdatePercent(0)
    try {
      const res = await window.api.updateYtdlp()
      if (res.success) {
        toast.success('yt-dlp updated successfully!')
        const freshInfo = await window.api.checkYtdlUpdates()
        setYtdlVersionInfo(freshInfo)
      } else {
        toast.error(`Update failed: ${res.error || 'Unknown error'}`)
      }
    } catch (err: any) {
      toast.error(`Update failed: ${err.message}`)
    } finally {
      setIsUpdatingYtdlp(false)
    }
  }

  const startDownloadProcess = async (
    id: string,
    url: string,
    format: 'mp4' | 'mp3' | 'best' | 'file' | 'torrent',
    resolution: string,
    title?: string
  ): Promise<void> => {
    // Update queue item state to downloading
    setQueue((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: 'downloading',
              percent: 0,
              speed: 'Connecting...',
              eta: '--:--'
            }
          : item
      )
    )

    if (!window.api) {
      // Browser Demo: Simulate download
      let currentPercent = 0
      const interval = setInterval(() => {
        currentPercent += 10
        if (currentPercent >= 100) {
          clearInterval(interval)
          setQueue((prev) => prev.filter((item) => item.id !== id))
          const historyItem: HistoryItem = {
            id,
            url,
            title: 'Simulated Media Download',
            fileName: format === 'mp3' ? 'Simulated Download.mp3' : 'Simulated Download.mp4',
            filePath: `C:\\Users\\User\\Downloads\\Simulated Download${format === 'mp3' ? '.mp3' : '.mp4'}`,
            fileSize: '24.5 MiB',
            date: new Date().toLocaleString(),
            format: format === 'mp3' ? 'mp3' : 'mp4',
            status: 'completed'
          }
          setSettings((prev) => ({
            ...prev,
            history: [historyItem, ...prev.history]
          }))
          toast.success('Download finished!')
        } else {
          setQueue((prev) =>
            prev.map((item) =>
              item.id === id
                ? {
                    ...item,
                    percent: currentPercent,
                    speed: `${(1.0 + Math.random() * 0.5).toFixed(2)} MiB/s`,
                    eta: `00:0${Math.ceil((100 - currentPercent) / 10)}`
                  }
                : item
            )
          )
        }
      }, 800)
      ;(window as any)[`sim-${id}`] = interval
      return
    }

    try {
      await window.api.startDownload({ id, url, format, resolution, title })
    } catch (err: any) {
      toast.error(`Download failed to start: ${err.message}`)
      setQueue((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                status: 'ready',
                percent: 0,
                speed: '',
                eta: ''
              }
            : item
        )
      )
    }
  }

  const handleQueueDownload = async (
    id: string,
    url: string,
    format: 'mp4' | 'mp3' | 'best' | 'file' | 'torrent',
    resolution: string
  ): Promise<void> => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: 'queued',
              percent: 0,
              speed: 'Queued...',
              eta: '--:--',
              url,
              format,
              resolution
            }
          : item
      )
    )
  }

  const handleStartAllDownloads = async (): Promise<void> => {
    const readyItems = queue.filter((item) => item.status === 'ready')
    if (readyItems.length === 0) return

    setQueue((prev) =>
      prev.map((item) =>
        item.status === 'ready'
          ? {
              ...item,
              status: 'queued',
              percent: 0,
              speed: 'Queued...',
              eta: '--:--'
            }
          : item
      )
    )
  }

  const handleCancelDownload = async (id: string): Promise<void> => {
    const item = queue.find((q) => q.id === id)
    if (!item) return

    if (item.status === 'ready') {
      setQueue((prev) => prev.filter((q) => q.id !== id))
      return
    }

    if (item.status === 'queued') {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === id
            ? {
                ...q,
                status: 'ready',
                percent: 0,
                speed: '',
                eta: ''
              }
            : q
        )
      )
      return
    }

    if (!window.api) {
      const interval = (window as any)[`sim-${id}`]
      if (interval) {
        clearInterval(interval)
        delete (window as any)[`sim-${id}`]
      }
      setQueue((prev) =>
        prev.map((q) =>
          q.id === id
            ? {
                ...q,
                status: 'ready',
                percent: 0,
                speed: '',
                eta: ''
              }
            : q
        )
      )
      return
    }
    await window.api.cancelDownload(id)
  }

  const handlePauseDownload = async (id: string): Promise<void> => {
    if (!window.api) {
      // Browser demo: freeze the simulated download in place
      const interval = (window as any)[`sim-${id}`]
      if (interval) {
        clearInterval(interval)
        delete (window as any)[`sim-${id}`]
      }
      setQueue((prev) =>
        prev.map((q) => (q.id === id ? { ...q, status: 'paused', speed: 'Paused', eta: '' } : q))
      )
      return
    }
    await window.api.pauseDownload(id)
  }

  const handleResumeDownload = (id: string): void => {
    // Re-queue it; the concurrency worker restarts the download and aria2
    // resumes from its .aria2 control file
    setQueue((prev) =>
      prev.map((q) =>
        q.id === id
          ? {
              ...q,
              status: 'queued',
              speed: 'Queued...',
              eta: '--:--'
            }
          : q
      )
    )
  }

  const handleCancelAllDownloads = async (): Promise<void> => {
    const activeAndQueued = queue.filter((item) =>
      ['queued', 'downloading', 'merging'].includes(item.status)
    )

    if (activeAndQueued.length === 0) return

    setQueue((prev) =>
      prev.map((item) => {
        if (item.status === 'queued') {
          return {
            ...item,
            status: 'ready' as const,
            percent: 0,
            speed: '',
            eta: ''
          }
        }
        if (!window.api && ['downloading', 'merging'].includes(item.status)) {
          const interval = (window as any)[`sim-${item.id}`]
          if (interval) {
            clearInterval(interval)
            delete (window as any)[`sim-${item.id}`]
          }
          return {
            ...item,
            status: 'ready' as const,
            percent: 0,
            speed: '',
            eta: ''
          }
        }
        return item
      })
    )

    if (window.api) {
      for (const item of activeAndQueued) {
        if (['downloading', 'merging'].includes(item.status)) {
          await window.api.cancelDownload(item.id)
        }
      }
    }
  }

  const handleClearAllQueue = async (): Promise<void> => {
    const activeItems = queue.filter((item) => ['downloading', 'merging'].includes(item.status))

    if (activeItems.length > 0) {
      if (window.api) {
        for (const item of activeItems) {
          await window.api.cancelDownload(item.id)
        }
      } else {
        for (const item of activeItems) {
          const interval = (window as any)[`sim-${item.id}`]
          if (interval) {
            clearInterval(interval)
            delete (window as any)[`sim-${item.id}`]
          }
        }
      }
    }

    setQueue([])
  }

  const handleUpdateQueueItemFormat = (id: string, newFormat: 'mp4' | 'mp3'): void => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              format: newFormat,
              resolution:
                newFormat === 'mp3'
                  ? 'best'
                  : item.resolution === 'best'
                    ? '1080'
                    : item.resolution,
              fileSize: undefined
            }
          : item
      )
    )
  }

  const handleUpdateQueueItemResolution = (id: string, newRes: string): void => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              resolution: newRes,
              fileSize: undefined
            }
          : item
      )
    )
  }

  const handlePlayFile = async (filePath: string): Promise<void> => {
    if (!window.api) {
      return
    }
    const opened = await window.api.playFile(filePath)
    if (!opened) {
      toast.error('Could not open file. File may have been moved or deleted.')
    }
  }

  const handleShowInFolder = async (filePath: string): Promise<void> => {
    if (!window.api) {
      return
    }
    const revealed = await window.api.showInFolder(filePath)
    if (!revealed) {
      toast.error('Could not locate folder. Directory may have been moved or deleted.')
    }
  }

  const handleSelectDownloadDir = async (type: 'video' | 'music' | 'files'): Promise<void> => {
    const key =
      type === 'video'
        ? 'downloadDirVideo'
        : type === 'music'
          ? 'downloadDirMusic'
          : 'downloadDirFiles'
    if (!window.api) {
      setSettings((prev) => ({
        ...prev,
        [key]: `C:\\Users\\User\\CustomDownloads\\${
          type === 'video' ? 'Video' : type === 'music' ? 'Music' : 'Files'
        }`
      }))
      return
    }
    const selectedPath = await window.api.selectDownloadDir()
    if (selectedPath) {
      const updated = await window.api.updateSettings({ [key]: selectedPath })
      setSettings(updated)
    }
  }

  const handleProxyUpdate = async (e: React.FocusEvent<HTMLInputElement>): Promise<void> => {
    const value = e.target.value.trim()
    if (!window.api) {
      setSettings((prev) => ({
        ...prev,
        proxy: value
      }))
      return
    }
    if (value !== settings.proxy) {
      const updated = await window.api.updateSettings({ proxy: value })
      setSettings(updated)
      toast.success('Proxy configuration saved')
    }
  }

  const handleClearHistory = async (): Promise<void> => {
    if (!window.api) {
      setSettings((prev) => ({
        ...prev,
        history: []
      }))
      return
    }
    const updated = await window.api.clearHistory()
    setSettings(updated)
  }

  // Subtle notifications: bottom corner, neutral colors, short-lived
  const toaster = (
    <Toaster
      position="bottom-right"
      theme={theme}
      duration={2500}
      gap={6}
      toastOptions={{
        style: { fontSize: '12px', padding: '10px 14px', borderRadius: '12px' }
      }}
    />
  )

  // Render loading screen while binary checks compile
  if (needsSetup === null) {
    return (
      <div className="flex flex-col h-screen w-screen bg-apple-bg-light dark:bg-apple-bg-dark text-apple-text-light dark:text-apple-text-dark overflow-hidden">
        <TitleBar mode="full" />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 border-4 border-apple-blue border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-medium mt-4 opacity-80">Launching Application...</span>
          </div>
        </div>
      </div>
    )
  }

  // Render Binary installer modal if requirements are missing
  if (needsSetup) {
    return (
      <div className="flex flex-col h-screen w-screen bg-apple-bg-light dark:bg-apple-bg-dark overflow-hidden">
        {toaster}
        <TitleBar mode="full" />
        <div className="flex-1 overflow-y-auto">
          <BinaryStatusModal onComplete={() => setNeedsSetup(false)} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-apple-bg-light dark:bg-apple-bg-dark text-apple-text-light dark:text-apple-text-dark overflow-hidden font-sans">
      {toaster}

      <TitleBar
        mode={mode}
        activeTab={activeTab}
        onTabChange={mode === 'full' ? setActiveTab : undefined}
        activeCount={activeCount}
        dockSide={dockSide}
        onDock={handleDock}
        onExpand={handleExpandWindow}
        onMini={handleMiniMode}
        theme={theme}
        onCycleTheme={cycleTheme}
      />

      {/* Mini mode: paste box + slim progress rows only */}
      {mode === 'mini' && (
        <MiniView
          queue={queue}
          urlInput={urlInput}
          onUrlInputChange={setUrlInput}
          isFetchingInfo={isFetchingInfo}
          format={format}
          onFormatChange={handleFormatChange}
          resolution={resolution}
          onResolutionChange={handleResolutionChange}
          onStart={handleQueueDownload}
          onStartAll={handleStartAllDownloads}
          onCancel={handleCancelDownload}
          onPause={handlePauseDownload}
          onResume={handleResumeDownload}
        />
      )}

      {/* Dock mode: narrow vertical queue panel */}
      {mode === 'dock' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <PasteBox
            urlInput={urlInput}
            onUrlInputChange={setUrlInput}
            isFetchingInfo={isFetchingInfo}
            format={format}
            onFormatChange={handleFormatChange}
            resolution={resolution}
            onResolutionChange={handleResolutionChange}
            compact
          />
          <DownloadQueue
            queue={queue}
            onCancel={handleCancelDownload}
            onStart={handleQueueDownload}
            onStartAll={handleStartAllDownloads}
            onCancelAll={handleCancelAllDownloads}
            onClearAll={handleClearAllQueue}
            onUpdateFormat={handleUpdateQueueItemFormat}
            onUpdateResolution={handleUpdateQueueItemResolution}
            onPause={handlePauseDownload}
            onResume={handleResumeDownload}
            maxConcurrentDownloads={settings.maxConcurrentDownloads || DEFAULT_CONCURRENCY}
            onUpdateConcurrencyLimit={handleConcurrencyChange}
            compact
          />
        </div>
      )}

      {/* Full mode: tabbed layout */}
      {mode === 'full' && (
        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-6 max-w-4xl w-full mx-auto">
            {activeTab === 'download' && (
              <div className="space-y-6">
                <PasteBox
                  urlInput={urlInput}
                  onUrlInputChange={setUrlInput}
                  isFetchingInfo={isFetchingInfo}
                  format={format}
                  onFormatChange={handleFormatChange}
                  resolution={resolution}
                  onResolutionChange={handleResolutionChange}
                />

                <DownloadQueue
                  queue={queue}
                  onCancel={handleCancelDownload}
                  onStart={handleQueueDownload}
                  onStartAll={handleStartAllDownloads}
                  onCancelAll={handleCancelAllDownloads}
                  onClearAll={handleClearAllQueue}
                  onUpdateFormat={handleUpdateQueueItemFormat}
                  onUpdateResolution={handleUpdateQueueItemResolution}
                  onPause={handlePauseDownload}
                  onResume={handleResumeDownload}
                  maxConcurrentDownloads={settings.maxConcurrentDownloads || DEFAULT_CONCURRENCY}
                  onUpdateConcurrencyLimit={handleConcurrencyChange}
                />
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center px-1">
                  <p className="text-xs text-apple-text-secondary-light dark:text-apple-text-secondary-dark">
                    Your downloaded media files history log
                  </p>
                  {settings.history.length > 0 && (
                    <button
                      onClick={handleClearHistory}
                      className="flex items-center space-x-1.5 text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear All</span>
                    </button>
                  )}
                </div>
                <HistoryList
                  history={settings.history}
                  onPlay={handlePlayFile}
                  onShowInFolder={handleShowInFolder}
                />
              </div>
            )}

            {activeTab === 'settings' && (
              <SettingsTab
                settings={settings}
                hasOngoingDownloads={hasOngoingDownloads}
                onSelectDownloadDir={handleSelectDownloadDir}
                onConcurrencyChange={handleConcurrencyChange}
                ytdlVersionInfo={ytdlVersionInfo}
                isCheckingUpdates={isCheckingUpdates}
                isUpdatingYtdlp={isUpdatingYtdlp}
                ytdlpUpdatePercent={ytdlpUpdatePercent}
                onCheckUpdates={triggerUpdateCheck}
                onUpdateYtdlp={handleUpdateYtdlp}
                onProxyUpdate={handleProxyUpdate}
              />
            )}
          </div>
        </main>
      )}

      <StatusBar
        queue={queue}
        ytdlVersionInfo={ytdlVersionInfo}
        isCheckingUpdates={isCheckingUpdates}
        onGoToSettings={mode === 'full' ? () => setActiveTab('settings') : undefined}
        compact={mode !== 'full'}
      />
    </div>
  )
}
