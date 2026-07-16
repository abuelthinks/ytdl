import React from 'react'
import { CheckCircle2, ArrowDownToLine, Loader2, RefreshCw } from 'lucide-react'
import { DownloadProgress } from '../../../main/downloader'

interface StatusBarProps {
  queue: DownloadProgress[]
  ytdlVersionInfo: { current: string; latest: string; updateAvailable: boolean } | null
  isCheckingUpdates: boolean
  onGoToSettings?: () => void
  compact?: boolean
}

function parseSpeedToBytes(speed?: string): number {
  if (!speed) return 0
  const match = speed.match(/([\d.]+)\s*([KMGT]?i?B)\/s/i)
  if (!match) return 0
  const value = parseFloat(match[1])
  const unit = match[2].toUpperCase()
  if (unit.startsWith('T')) return value * 1024 ** 4
  if (unit.startsWith('G')) return value * 1024 ** 3
  if (unit.startsWith('M')) return value * 1024 ** 2
  if (unit.startsWith('K')) return value * 1024
  return value
}

function formatSpeed(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB/s`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB/s`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB/s`
  return bytes > 0 ? `${bytes.toFixed(0)} B/s` : ''
}

export default function StatusBar({
  queue,
  ytdlVersionInfo,
  isCheckingUpdates,
  onGoToSettings,
  compact = false
}: StatusBarProps): React.JSX.Element {
  const activeItems = queue.filter((item) => ['downloading', 'merging'].includes(item.status))
  const queuedCount = queue.filter((item) => item.status === 'queued').length
  const totalSpeed = activeItems.reduce((sum, item) => sum + parseSpeedToBytes(item.speed), 0)
  const speedLabel = formatSpeed(totalSpeed)

  return (
    <footer className="h-7 flex items-center justify-between px-3 bg-apple-card-light dark:bg-apple-card-dark border-t border-apple-border-light dark:border-apple-border-dark text-[10px] text-apple-text-secondary-light dark:text-apple-text-secondary-dark flex-shrink-0">
      <button
        onClick={onGoToSettings}
        disabled={!onGoToSettings}
        className={`flex items-center space-x-1.5 min-w-0 ${onGoToSettings ? 'hover:text-apple-text-light dark:hover:text-apple-text-dark transition-colors' : 'cursor-default'}`}
        title={
          ytdlVersionInfo?.updateAvailable ? 'Update available — open settings' : 'yt-dlp status'
        }
      >
        {isCheckingUpdates ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
            {!compact && <span>Checking for updates...</span>}
          </>
        ) : ytdlVersionInfo?.updateAvailable ? (
          <>
            <RefreshCw className="w-3 h-3 text-amber-500 flex-shrink-0" />
            <span className="text-amber-500 font-semibold truncate">
              {compact ? 'Update' : `yt-dlp ${ytdlVersionInfo.latest} available`}
            </span>
          </>
        ) : (
          <>
            <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
            <span className="truncate">
              {compact
                ? 'Up to date'
                : `yt-dlp ${ytdlVersionInfo?.current || 'unknown'} · up to date`}
            </span>
          </>
        )}
      </button>

      <div className="flex items-center space-x-1.5 flex-shrink-0">
        {activeItems.length > 0 ? (
          <>
            <ArrowDownToLine className="w-3 h-3 text-apple-blue" />
            <span className="font-semibold text-apple-text-light dark:text-apple-text-dark">
              {activeItems.length} downloading
              {queuedCount > 0 ? ` · ${queuedCount} queued` : ''}
              {speedLabel ? ` · ${speedLabel}` : ''}
            </span>
          </>
        ) : (
          <span>{queue.length > 0 ? `${queue.length} in queue` : 'Idle'}</span>
        )}
      </div>
    </footer>
  )
}
