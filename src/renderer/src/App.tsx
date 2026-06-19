import React, { useEffect, useRef, useState } from 'react'
import { Download, History, Settings, Trash2, HelpCircle } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import BinaryStatusModal from './components/BinaryStatusModal'
import DownloadQueue from './components/DownloadQueue'
import DownloadForm from './components/DownloadForm'
import SettingsTab from './components/SettingsTab'
import HistoryList, { HistoryItem } from './components/HistoryList'
import { DownloadProgress } from '../../main/downloader'
import { AppSettings } from './types'
import { DEFAULT_CONCURRENCY } from './constants'

export default function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'download' | 'history' | 'settings'>('download')
  const [urlInput, setUrlInput] = useState('')
  const [format, setFormat] = useState<'mp4' | 'mp3'>('mp4')
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
                toast.error('Download failed. Check details in history.')
              } else if (data.status === 'cancelled') {
                toast.warning('Download cancelled.')
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

  // Dynamically fetch video info when the URL changes
  useEffect(() => {
    const trimmed = urlInput.trim()
    if (!trimmed || (!trimmed.startsWith('http://') && !trimmed.startsWith('https://'))) {
      return
    }

    const timer = setTimeout(async () => {
      setIsFetchingInfo(true)
      try {
        const timestamp = Date.now()
        const formatToUse = formatRef.current
        const resToUse = formatToUse === 'mp3' ? 'best' : resolutionRef.current

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

          if (newItems.length > 1) {
            toast.success(`Added ${newItems.length} videos from playlist to queue!`)
          } else {
            toast.success('Added video to download queue!')
          }
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
            toast.success(`Added ${newItems.length} videos from playlist to queue!`)
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
            toast.success('Added video to download queue!')
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

  const handleFormatChange = async (newFormat: 'mp4' | 'mp3'): Promise<void> => {
    setFormat(newFormat)
    if (window.api) {
      const updated = await window.api.updateSettings({ lastFormat: newFormat })
      setSettings(updated)
    }
    setQueue((prev) =>
      prev.map((item) =>
        item.status === 'ready'
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
        item.status === 'ready'
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
    toast.success(`Concurrency limit set to ${limit}`)
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
        toast.info(
          'Simulated: A new yt-dlp update is available (2024.05.27). Update it in Settings!',
          {
            duration: 10000
          }
        )
        setIsCheckingUpdates(false)
      }, 1000)
      return
    }

    try {
      const res = await window.api.checkYtdlUpdates()
      setYtdlVersionInfo(res)
      if (res.updateAvailable) {
        toast.info(`A new yt-dlp update is available (${res.latest}). Update it in Settings!`, {
          duration: 10000
        })
      }
    } catch (err) {
      console.error('Failed to check for updates:', err)
    } finally {
      setIsCheckingUpdates(false)
    }
  }

  const handleUpdateYtdlp = async (): Promise<void> => {
    if (!window.api) {
      toast.info('Simulating update in web preview...')
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
    format: 'mp4' | 'mp3' | 'best',
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
      toast.info('Starting simulated download in web preview...')
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
    format: 'mp4' | 'mp3' | 'best',
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

    toast.info(`Queued ${readyItems.length} downloads...`)
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
      toast.info('Removed from download queue.')
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
      toast.warning('Simulated download cancelled.')
      return
    }
    await window.api.cancelDownload(id)
  }

  const handleCancelAllDownloads = async (): Promise<void> => {
    const activeAndQueued = queue.filter((item) =>
      ['queued', 'downloading', 'merging'].includes(item.status)
    )

    if (activeAndQueued.length === 0) return

    toast.warning(`Cancelling all ${activeAndQueued.length} downloads...`)

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
      toast.warning(`Cancelling and clearing all ${queue.length} downloads...`)
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
    } else {
      toast.info('Downloads queue cleared.')
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
                newFormat === 'mp3' ? 'best' : item.resolution === 'best' ? '1080' : item.resolution
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
              resolution: newRes
            }
          : item
      )
    )
  }

  const handlePlayFile = async (filePath: string): Promise<void> => {
    if (!window.api) {
      toast.info(`Simulating media playback for: ${filePath}`)
      return
    }
    const opened = await window.api.playFile(filePath)
    if (!opened) {
      toast.error('Could not open file. File may have been moved or deleted.')
    }
  }

  const handleShowInFolder = async (filePath: string): Promise<void> => {
    if (!window.api) {
      toast.info(`Simulating folder location: ${filePath}`)
      return
    }
    const revealed = await window.api.showInFolder(filePath)
    if (!revealed) {
      toast.error('Could not locate folder. Directory may have been moved or deleted.')
    }
  }

  const handleSelectDownloadDir = async (type: 'video' | 'music'): Promise<void> => {
    const key = type === 'video' ? 'downloadDirVideo' : 'downloadDirMusic'
    if (!window.api) {
      setSettings((prev) => ({
        ...prev,
        [key]: `C:\\Users\\User\\CustomDownloads\\${type === 'video' ? 'Video' : 'Music'}`
      }))
      toast.success(`Simulated ${type === 'video' ? 'Video' : 'Music'} download directory updated`)
      return
    }
    const selectedPath = await window.api.selectDownloadDir()
    if (selectedPath) {
      const updated = await window.api.updateSettings({ [key]: selectedPath })
      setSettings(updated)
      toast.success(`${type === 'video' ? 'Video' : 'Music'} download directory updated`)
    }
  }

  const handleProxyUpdate = async (e: React.FocusEvent<HTMLInputElement>): Promise<void> => {
    const value = e.target.value.trim()
    if (!window.api) {
      setSettings((prev) => ({
        ...prev,
        proxy: value
      }))
      toast.success('Simulated proxy configuration saved')
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
      toast.success('Simulated history cleared')
      return
    }
    const updated = await window.api.clearHistory()
    setSettings(updated)
    toast.success('History cleared successfully')
  }

  // Render loading screen while binary checks compile
  if (needsSetup === null) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-apple-bg-light dark:bg-apple-bg-dark text-apple-text-light dark:text-apple-text-dark">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-apple-blue border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium mt-4 opacity-80">Launching Application...</span>
        </div>
      </div>
    )
  }

  // Render Binary installer modal if requirements are missing
  if (needsSetup) {
    return (
      <>
        <Toaster position="top-right" richColors />
        <BinaryStatusModal onComplete={() => setNeedsSetup(false)} />
      </>
    )
  }

  return (
    <div className="flex h-screen w-screen bg-apple-bg-light dark:bg-apple-bg-dark text-apple-text-light dark:text-apple-text-dark overflow-hidden font-sans">
      <Toaster position="top-right" richColors />

      {/* Sidebar Navigation */}
      <aside className="w-64 bg-apple-card-light dark:bg-apple-card-dark border-r border-apple-border-light dark:border-apple-border-dark flex flex-col justify-between p-5">
        <div className="space-y-6">
          {/* Logo / App Name */}
          <div className="flex items-center space-x-3 px-2">
            <div className="w-8 h-8 rounded-lg bg-apple-blue flex items-center justify-center shadow-md">
              <Download className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-base tracking-tight text-apple-text-light dark:text-apple-text-dark">
              Media Downloader
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('download')}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'download'
                  ? 'bg-apple-blue text-white shadow-sm'
                  : 'text-apple-text-secondary-light dark:text-apple-text-secondary-dark hover:bg-apple-gray-bg-light dark:hover:bg-apple-gray-bg-dark hover:text-apple-text-light dark:hover:text-apple-text-dark'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'history'
                  ? 'bg-apple-blue text-white shadow-sm'
                  : 'text-apple-text-secondary-light dark:text-apple-text-secondary-dark hover:bg-apple-gray-bg-light dark:hover:bg-apple-gray-bg-dark hover:text-apple-text-light dark:hover:text-apple-text-dark'
              }`}
            >
              <History className="w-4 h-4" />
              <span>History</span>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'settings'
                  ? 'bg-apple-blue text-white shadow-sm'
                  : 'text-apple-text-secondary-light dark:text-apple-text-secondary-dark hover:bg-apple-gray-bg-light dark:hover:bg-apple-gray-bg-dark hover:text-apple-text-light dark:hover:text-apple-text-dark'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        {/* Footer Info */}
        <div className="flex items-center space-x-2 px-2 text-xs text-apple-text-secondary-light/60 dark:text-apple-text-secondary-dark/60">
          <HelpCircle className="w-3.5 h-3.5" />
          <span>v1.0.0 • yt-dlp Wrapper</span>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="h-16 border-b border-apple-border-light dark:border-apple-border-dark flex items-center px-8 bg-apple-card-light/40 dark:bg-apple-card-dark/40 backdrop-blur-md sticky top-0 z-10">
          <h1 className="text-lg font-semibold text-apple-text-light dark:text-apple-text-dark capitalize">
            {activeTab === 'download' ? 'Video Downloader' : activeTab}
          </h1>
        </header>

        <div className="flex-1 p-8 max-w-4xl w-full mx-auto">
          {activeTab === 'download' && (
            <div className="space-y-8">
              <DownloadForm
                urlInput={urlInput}
                onUrlInputChange={setUrlInput}
                isFetchingInfo={isFetchingInfo}
                format={format}
                onFormatChange={handleFormatChange}
                resolution={resolution}
                onResolutionChange={handleResolutionChange}
              />

              {/* Active Downloads List */}
              <div className="pt-4 border-t border-apple-border-light dark:border-apple-border-dark">
                <DownloadQueue
                  queue={queue}
                  onCancel={handleCancelDownload}
                  onStart={handleQueueDownload}
                  onStartAll={handleStartAllDownloads}
                  onCancelAll={handleCancelAllDownloads}
                  onClearAll={handleClearAllQueue}
                  onUpdateFormat={handleUpdateQueueItemFormat}
                  onUpdateResolution={handleUpdateQueueItemResolution}
                  maxConcurrentDownloads={settings.maxConcurrentDownloads || DEFAULT_CONCURRENCY}
                  onUpdateConcurrencyLimit={handleConcurrencyChange}
                />
              </div>
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
    </div>
  )
}
