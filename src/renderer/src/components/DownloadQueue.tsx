import React from 'react'
import { X, Play, Pause, AlertCircle, RefreshCw, FileDown } from 'lucide-react'
import { DownloadProgress } from '../../../main/downloader'
import { CONCURRENCY_OPTIONS, RESOLUTION_OPTIONS } from '../constants'

interface DownloadQueueProps {
  queue: DownloadProgress[]
  onCancel: (id: string) => void
  onStart: (
    id: string,
    url: string,
    format: 'mp4' | 'mp3' | 'best' | 'file' | 'torrent',
    resolution: string
  ) => void
  onStartAll?: () => void
  onCancelAll?: () => void
  onClearAll?: () => void
  onUpdateFormat?: (id: string, format: 'mp4' | 'mp3') => void
  onUpdateResolution?: (id: string, resolution: string) => void
  onPause?: (id: string) => void
  onResume?: (id: string) => void
  maxConcurrentDownloads?: number
  onUpdateConcurrencyLimit?: (limit: number) => void
  compact?: boolean
}

const formatDuration = (sec: number): string => {
  if (!sec) return '0:00'
  const hrs = Math.floor(sec / 3600)
  const mins = Math.floor((sec % 3600) / 60)
  const secs = Math.floor(sec % 60)

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const selectStyle =
  'px-2 py-1 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark border border-apple-border-light dark:border-apple-border-dark rounded-lg text-[10px] font-semibold text-apple-text-light dark:text-apple-text-dark focus:outline-none cursor-pointer'

export default function DownloadQueue({
  queue,
  onCancel,
  onStart,
  onStartAll,
  onCancelAll,
  onClearAll,
  onUpdateFormat,
  onUpdateResolution,
  onPause,
  onResume,
  maxConcurrentDownloads = 5,
  onUpdateConcurrencyLimit,
  compact = false
}: DownloadQueueProps): React.JSX.Element {
  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-apple-gray-bg-light/30 dark:bg-apple-gray-bg-dark/10 border border-dashed border-apple-border-light dark:border-apple-border-dark rounded-2xl">
        <Play className="w-8 h-8 text-apple-text-secondary-light/40 dark:text-apple-text-secondary-dark/40 mb-2" />
        <span className="text-sm font-medium text-apple-text-secondary-light dark:text-apple-text-secondary-dark">
          No active downloads
        </span>
        <span className="text-xs text-apple-text-secondary-light/60 dark:text-apple-text-secondary-dark/60 mt-1 text-center">
          Paste a link above to start downloading.
        </span>
      </div>
    )
  }

  const hasActiveOrQueued = queue.some((item) =>
    ['queued', 'downloading', 'merging'].includes(item.status)
  )
  const hasOngoingDownloads = queue.some((item) => ['downloading', 'merging'].includes(item.status))
  const activeCount = queue.filter((item) =>
    ['downloading', 'merging'].includes(item.status)
  ).length
  const readyCount = queue.filter((item) => item.status === 'ready').length

  return (
    <div className="space-y-3">
      {/* Queue toolbar */}
      <div className="flex flex-wrap justify-between items-center gap-2 px-1">
        <div className="flex items-center space-x-3 min-w-0">
          <h3 className="text-xs font-semibold text-apple-text-secondary-light dark:text-apple-text-secondary-dark whitespace-nowrap">
            Queue · {queue.length} item{queue.length !== 1 ? 's' : ''}
            {activeCount > 0 ? ` · ${activeCount} active` : ''}
          </h3>
          {onUpdateConcurrencyLimit && !compact && (
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-apple-text-secondary-light dark:text-apple-text-secondary-dark">
                Limit
              </span>
              <select
                disabled={hasOngoingDownloads}
                value={maxConcurrentDownloads}
                onChange={(e) => onUpdateConcurrencyLimit(parseInt(e.target.value, 10))}
                title={
                  hasOngoingDownloads
                    ? 'Cannot change limit during active downloads'
                    : 'Max simultaneous downloads'
                }
                className={`${selectStyle} ${hasOngoingDownloads ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {CONCURRENCY_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {onClearAll && (
            <button
              onClick={onClearAll}
              className="px-3 py-1.5 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark border border-apple-border-light dark:border-apple-border-dark text-apple-text-light dark:text-apple-text-dark hover:bg-apple-border-light/60 dark:hover:bg-apple-border-dark/60 rounded-xl text-[11px] font-semibold active:scale-95 transition-all"
            >
              Clear
            </button>
          )}
          {hasActiveOrQueued && onCancelAll && (
            <button
              onClick={onCancelAll}
              className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-[11px] font-semibold active:scale-95 transition-all"
            >
              Cancel all
            </button>
          )}
          {readyCount >= 2 && onStartAll && (
            <button
              onClick={onStartAll}
              className="px-3 py-1.5 bg-apple-blue hover:bg-apple-blue/90 text-white rounded-xl text-[11px] font-semibold active:scale-95 transition-all"
            >
              Download all
            </button>
          )}
        </div>
      </div>

      {/* Queue cards */}
      <div className="space-y-2.5">
        {queue.map((item) => {
          const isReady = item.status === 'ready'
          const isQueued = item.status === 'queued'
          const isMerging = item.status === 'merging'
          const isFailed = item.status === 'failed'
          const isPaused = item.status === 'paused'
          const isActive = ['downloading', 'merging'].includes(item.status)
          const isPending =
            item.status === 'downloading' && item.percent === 0 && item.speed === '0 B/s'

          return (
            <div
              key={item.id}
              className={`p-3 bg-apple-card-light dark:bg-apple-card-dark border border-apple-border-light dark:border-apple-border-dark rounded-2xl shadow-sm transition-all duration-200 ${
                isQueued ? 'opacity-75' : 'hover:shadow-md'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Thumbnail */}
                <div
                  className={`relative ${compact ? 'w-16' : 'w-24 sm:w-28'} aspect-video rounded-lg overflow-hidden bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark flex-shrink-0`}
                >
                  {item.thumbnail ? (
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      className={`w-full h-full object-cover ${isQueued ? 'grayscale opacity-70' : ''}`}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-apple-text-secondary-light/40 dark:text-apple-text-secondary-dark/40">
                      {item.format === 'file' || item.format === 'torrent' ? (
                        <FileDown className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </div>
                  )}
                  {item.duration ? (
                    <span className="absolute bottom-1 right-1 bg-black/75 backdrop-blur-sm text-white text-[9px] font-semibold px-1 rounded font-mono">
                      {formatDuration(item.duration)}
                    </span>
                  ) : null}
                </div>

                {/* Metadata + state */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-[13px] font-semibold text-apple-text-light dark:text-apple-text-dark truncate">
                        {item.title || item.fileName || 'Fetching details...'}
                      </h4>
                      <p className="text-[11px] text-apple-text-secondary-light dark:text-apple-text-secondary-dark mt-0.5 truncate">
                        {[
                          item.uploader,
                          item.fileSize && item.fileSize !== 'Calculating size...'
                            ? item.fileSize
                            : null
                        ]
                          .filter(Boolean)
                          .join(' · ') || ' '}
                      </p>
                    </div>
                    <div className="flex items-center flex-shrink-0">
                      {isActive && item.format === 'torrent' && onPause && (
                        <button
                          onClick={() => onPause(item.id)}
                          className="p-1.5 rounded-lg text-apple-text-secondary-light dark:text-apple-text-secondary-dark hover:text-apple-blue hover:bg-apple-blue/10 active:scale-95 transition-all"
                          title="Pause"
                        >
                          <Pause className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {isPaused && onResume && (
                        <button
                          onClick={() => onResume(item.id)}
                          className="p-1.5 rounded-lg text-apple-blue hover:bg-apple-blue/10 active:scale-95 transition-all"
                          title="Resume"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => onCancel(item.id)}
                        className="p-1.5 rounded-lg text-apple-text-secondary-light dark:text-apple-text-secondary-dark hover:text-red-500 hover:bg-red-500/10 active:scale-95 transition-all"
                        title={isReady ? 'Remove' : 'Cancel'}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Ready: format chips + download */}
                  {isReady && (
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                      <div className="flex items-center space-x-1.5">
                        {item.format === 'file' || item.format === 'torrent' ? (
                          <span className="px-2 py-1 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark border border-apple-border-light dark:border-apple-border-dark rounded-lg text-[10px] font-semibold text-apple-text-secondary-light dark:text-apple-text-secondary-dark uppercase">
                            {item.format}
                          </span>
                        ) : (
                          <select
                            value={item.format || 'mp4'}
                            onChange={(e) =>
                              onUpdateFormat &&
                              onUpdateFormat(item.id, e.target.value as 'mp4' | 'mp3')
                            }
                            className={selectStyle}
                          >
                            <option value="mp4">MP4</option>
                            <option value="mp3">MP3</option>
                          </select>
                        )}
                        {item.format !== 'mp3' &&
                          item.format !== 'file' &&
                          item.format !== 'torrent' && (
                            <select
                              value={item.resolution || '1080'}
                              onChange={(e) =>
                                onUpdateResolution && onUpdateResolution(item.id, e.target.value)
                              }
                              className={selectStyle}
                            >
                              {RESOLUTION_OPTIONS.map((h) => (
                                <option key={h} value={h}>
                                  {h}p
                                </option>
                              ))}
                            </select>
                          )}
                        {item.fileSize === 'Calculating size...' && (
                          <span className="text-[10px] text-apple-text-secondary-light dark:text-apple-text-secondary-dark animate-pulse">
                            Sizing...
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() =>
                          onStart(
                            item.id,
                            item.url || '',
                            item.format || 'mp4',
                            item.resolution || '1080'
                          )
                        }
                        className="px-3.5 py-1.5 bg-apple-blue hover:bg-apple-blue/90 text-white rounded-xl text-[11px] font-semibold shadow-sm active:scale-95 transition-all"
                      >
                        Download
                      </button>
                    </div>
                  )}

                  {/* Queued */}
                  {isQueued && (
                    <div className="flex items-center space-x-2 mt-2">
                      <span className="inline-block px-2 py-0.5 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark border border-apple-border-light dark:border-apple-border-dark text-apple-text-secondary-light dark:text-apple-text-secondary-dark text-[10px] font-semibold rounded-md uppercase animate-pulse">
                        Queued
                      </span>
                      <span className="text-[10px] text-apple-text-secondary-light/70 dark:text-apple-text-secondary-dark/70 font-semibold uppercase">
                        {item.format === 'mp3'
                          ? 'MP3'
                          : item.format === 'file'
                            ? 'FILE'
                            : item.format === 'torrent'
                              ? 'TORRENT'
                              : `MP4 · ${item.resolution}p`}
                      </span>
                    </div>
                  )}

                  {/* Downloading / merging / paused / failed */}
                  {(isActive || isFailed || isPaused) && (
                    <div className="mt-2">
                      <div className="w-full bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            isMerging
                              ? 'bg-amber-500 animate-pulse'
                              : isFailed
                                ? 'bg-red-500'
                                : isPaused
                                  ? 'bg-apple-text-secondary-light/50 dark:bg-apple-text-secondary-dark/50'
                                  : 'bg-apple-blue'
                          }`}
                          style={{
                            width: isMerging ? '99%' : isFailed ? '100%' : `${item.percent}%`
                          }}
                        ></div>
                      </div>
                      <div className="flex items-center justify-between mt-1.5 text-[11px]">
                        {isMerging ? (
                          <span className="flex items-center text-amber-500 font-medium animate-pulse">
                            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                            Merging streams...
                          </span>
                        ) : isFailed ? (
                          <span className="flex items-center text-red-500 font-medium">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Failed
                          </span>
                        ) : isPaused ? (
                          <span className="flex items-center text-apple-text-secondary-light dark:text-apple-text-secondary-dark font-medium">
                            <Pause className="w-3 h-3 mr-1" />
                            Paused
                          </span>
                        ) : (
                          <span className="text-apple-text-secondary-light dark:text-apple-text-secondary-dark truncate">
                            {isPending
                              ? 'Connecting...'
                              : `${Math.round(item.percent)}% · ${item.speed}${item.eta ? ` · ${item.eta} left` : ''}`}
                          </span>
                        )}
                        <span className="font-semibold text-apple-text-light dark:text-apple-text-dark flex-shrink-0 ml-2">
                          {isMerging ? '99%' : `${Math.round(item.percent)}%`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
