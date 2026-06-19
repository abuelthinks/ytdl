import React from 'react'
import { X, Play, AlertCircle, RefreshCw } from 'lucide-react'
import { DownloadProgress } from '../../../main/downloader'
import { CONCURRENCY_OPTIONS, RESOLUTION_OPTIONS } from '../constants'

interface DownloadQueueProps {
  queue: DownloadProgress[]
  onCancel: (id: string) => void
  onStart: (id: string, url: string, format: 'mp4' | 'mp3' | 'best', resolution: string) => void
  onStartAll?: () => void
  onCancelAll?: () => void
  onClearAll?: () => void
  onUpdateFormat?: (id: string, format: 'mp4' | 'mp3') => void
  onUpdateResolution?: (id: string, resolution: string) => void
  maxConcurrentDownloads?: number
  onUpdateConcurrencyLimit?: (limit: number) => void
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

export default function DownloadQueue({
  queue,
  onCancel,
  onStart,
  onStartAll,
  onCancelAll,
  onClearAll,
  onUpdateFormat,
  onUpdateResolution,
  maxConcurrentDownloads = 5,
  onUpdateConcurrencyLimit
}: DownloadQueueProps): React.JSX.Element {
  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-apple-gray-bg-light/30 dark:bg-apple-gray-bg-dark/10 border border-dashed border-apple-border-light dark:border-apple-border-dark rounded-2xl">
        <Play className="w-8 h-8 text-apple-text-secondary-light/40 dark:text-apple-text-secondary-dark/40 mb-2" />
        <span className="text-sm font-medium text-apple-text-secondary-light dark:text-apple-text-secondary-dark">
          No active downloads
        </span>
        <span className="text-xs text-apple-text-secondary-light/60 dark:text-apple-text-secondary-dark/60 mt-1">
          Paste a link above to start downloading.
        </span>
      </div>
    )
  }

  const hasActiveOrQueued = queue.some((item) =>
    ['queued', 'downloading', 'merging'].includes(item.status)
  )

  const hasOngoingDownloads = queue.some((item) => ['downloading', 'merging'].includes(item.status))

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center px-1">
        <div className="flex items-center space-x-3">
          <h3 className="text-sm font-semibold text-apple-text-light dark:text-apple-text-dark">
            Active Downloads ({queue.length})
          </h3>
          {onUpdateConcurrencyLimit && (
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
                className={`px-2 py-0.5 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark border border-apple-border-light dark:border-apple-border-dark rounded-md text-[10px] font-semibold text-apple-text-light dark:text-apple-text-dark focus:outline-none ${
                  hasOngoingDownloads ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                }`}
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
          {queue.length > 0 && onClearAll && (
            <button
              onClick={onClearAll}
              className="px-3.5 py-1.5 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark border border-apple-border-light dark:border-apple-border-dark text-apple-text-light dark:text-apple-text-dark hover:bg-apple-border-light/60 dark:hover:bg-apple-border-dark/60 rounded-xl text-xs font-semibold shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              Clear Queue
            </button>
          )}
          {hasActiveOrQueued && onCancelAll && (
            <button
              onClick={onCancelAll}
              className="px-3.5 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-semibold shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              Cancel All
            </button>
          )}
          {queue.filter((item) => item.status === 'ready').length >= 2 && onStartAll && (
            <button
              onClick={onStartAll}
              className="px-3.5 py-1.5 bg-apple-blue hover:bg-apple-blue/90 text-white rounded-xl text-xs font-semibold shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              Download All
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {queue.map((item) => {
          if (item.status === 'ready') {
            return (
              <div
                key={item.id}
                className="p-4 bg-apple-card-light dark:bg-apple-card-dark border border-apple-border-light dark:border-apple-border-dark rounded-2xl shadow-sm hover:shadow-md transition-all duration-200"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    {/* Thumbnail */}
                    <div className="relative w-24 sm:w-28 aspect-video rounded-lg overflow-hidden bg-black flex-shrink-0">
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-apple-text-secondary-light/40 dark:text-apple-text-secondary-dark/40 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark text-[10px]">
                          No Pic
                        </div>
                      )}
                      {item.duration ? (
                        <span className="absolute bottom-1 right-1 bg-black/75 backdrop-blur-sm text-white text-[9px] font-semibold px-1 py-0.2 rounded font-mono">
                          {formatDuration(item.duration)}
                        </span>
                      ) : null}
                    </div>

                    {/* Text Metadata */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-apple-text-light dark:text-apple-text-dark truncate">
                        {item.title || 'Video Title'}
                      </h4>
                      <p className="text-xs text-apple-text-secondary-light dark:text-apple-text-secondary-dark mt-0.5 truncate">
                        {item.uploader || 'Creator'}
                      </p>

                      {/* Select Dropdowns for Format and Resolution */}
                      <div className="flex items-center space-x-2 mt-2">
                        <select
                          value={item.format || 'mp4'}
                          onChange={(e) =>
                            onUpdateFormat &&
                            onUpdateFormat(item.id, e.target.value as 'mp4' | 'mp3')
                          }
                          className="px-2 py-1 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark border border-apple-border-light dark:border-apple-border-dark rounded-lg text-[10px] font-semibold text-apple-text-light dark:text-apple-text-dark focus:outline-none cursor-pointer"
                        >
                          <option value="mp4">Video (MP4)</option>
                          <option value="mp3">Audio (MP3)</option>
                        </select>

                        {item.format !== 'mp3' && (
                          <select
                            value={item.resolution || '1080'}
                            onChange={(e) =>
                              onUpdateResolution && onUpdateResolution(item.id, e.target.value)
                            }
                            className="px-2 py-1 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark border border-apple-border-light dark:border-apple-border-dark rounded-lg text-[10px] font-semibold text-apple-text-light dark:text-apple-text-dark focus:outline-none cursor-pointer"
                          >
                            {RESOLUTION_OPTIONS.map((h) => (
                              <option key={h} value={h}>
                                {h}p
                              </option>
                            ))}
                          </select>
                        )}

                        {item.fileSize && (
                          <span className="inline-flex items-center px-2.5 py-1 bg-apple-gray-bg-light/60 dark:bg-apple-gray-bg-dark/60 border border-apple-border-light dark:border-apple-border-dark rounded-lg text-[10px] font-semibold text-apple-text-secondary-light dark:text-apple-text-secondary-dark">
                            {item.fileSize === 'Calculating size...' ? (
                              <span className="flex items-center gap-1.5 animate-pulse">
                                <span className="w-1.5 h-1.5 bg-apple-blue rounded-full animate-ping"></span>
                                Calculating size...
                              </span>
                            ) : (
                              item.fileSize
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                    <button
                      onClick={() =>
                        onStart(
                          item.id,
                          item.url || '',
                          item.format || 'mp4',
                          item.resolution || '1080'
                        )
                      }
                      className="flex items-center space-x-1.5 px-4 py-2 bg-apple-blue hover:bg-apple-blue/90 text-white rounded-xl text-xs font-semibold shadow-sm active:scale-95 transition-all cursor-pointer"
                    >
                      <span>Download</span>
                    </button>
                    <button
                      onClick={() => onCancel(item.id)}
                      className="p-2 rounded-xl text-apple-text-secondary-light hover:text-red-500 hover:bg-red-500/10 active:scale-95 transition-all cursor-pointer"
                      title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          }

          if (item.status === 'queued') {
            return (
              <div
                key={item.id}
                className="p-4 bg-apple-card-light dark:bg-apple-card-dark border border-apple-border-light dark:border-apple-border-dark rounded-2xl shadow-sm opacity-80 transition-all duration-200"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    {/* Thumbnail */}
                    <div className="relative w-24 sm:w-28 aspect-video rounded-lg overflow-hidden bg-black flex-shrink-0">
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          className="w-full h-full object-cover grayscale opacity-70"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-apple-text-secondary-light/40 dark:text-apple-text-secondary-dark/40 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark text-[10px]">
                          No Pic
                        </div>
                      )}
                      {item.duration ? (
                        <span className="absolute bottom-1 right-1 bg-black/75 backdrop-blur-sm text-white text-[9px] font-semibold px-1 py-0.2 rounded font-mono">
                          {formatDuration(item.duration)}
                        </span>
                      ) : null}
                    </div>

                    {/* Text Metadata */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-apple-text-light dark:text-apple-text-dark truncate">
                        {item.title || 'Video Title'}
                      </h4>
                      <p className="text-xs text-apple-text-secondary-light dark:text-apple-text-secondary-dark mt-0.5 truncate">
                        {item.uploader || 'Creator'}
                      </p>
                      <div className="flex items-center space-x-2 mt-2">
                        <span className="inline-block px-2 py-0.5 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark border border-apple-border-light dark:border-apple-border-dark text-apple-text-secondary-light dark:text-apple-text-secondary-dark text-[10px] font-semibold rounded-md uppercase animate-pulse">
                          Queued in line...
                        </span>
                        <span className="text-[10px] text-apple-text-secondary-light/60 dark:text-apple-text-secondary-dark/60 font-semibold uppercase">
                          {item.format === 'mp3'
                            ? 'Audio (MP3)'
                            : `Video (MP4 - ${item.resolution}p)`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                    <button
                      onClick={() => onCancel(item.id)}
                      className="p-2 rounded-xl text-apple-text-secondary-light hover:text-red-500 hover:bg-red-500/10 active:scale-95 transition-all cursor-pointer"
                      title="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          }

          const isPending =
            item.status === 'downloading' && item.percent === 0 && item.speed === '0 B/s'

          return (
            <div
              key={item.id}
              className="p-4 bg-apple-card-light dark:bg-apple-card-dark border border-apple-border-light dark:border-apple-border-dark rounded-2xl shadow-sm hover:shadow-md transition-all duration-200"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0 pr-4">
                  <h4 className="text-sm font-medium text-apple-text-light dark:text-apple-text-dark truncate">
                    {item.fileName || item.title || 'Fetching details...'}
                  </h4>
                  <p className="text-xs text-apple-text-secondary-light dark:text-apple-text-secondary-dark mt-0.5 truncate">
                    {item.status === 'merging'
                      ? 'Post-processing / Merging streams'
                      : `${item.fileSize ? `Size: ${item.fileSize} | ` : ''}Speed: ${item.speed} | ETA: ${item.eta}`}
                  </p>
                </div>

                {/* Cancel Button */}
                {['downloading', 'merging'].includes(item.status) && (
                  <button
                    onClick={() => onCancel(item.id)}
                    className="p-1 rounded-full text-apple-text-secondary-light hover:text-red-500 hover:bg-red-500/10 active:scale-95 transition-all cursor-pointer animate-fade-in"
                    title="Cancel Download"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    item.status === 'merging'
                      ? 'bg-amber-500 animate-pulse w-[99%]'
                      : item.status === 'failed'
                        ? 'bg-red-500 w-full'
                        : 'bg-apple-blue'
                  }`}
                  style={{ width: item.status === 'merging' ? '99%' : `${item.percent}%` }}
                ></div>
              </div>

              <div className="flex justify-between items-center mt-2 text-xs">
                <div className="flex items-center space-x-1">
                  {item.status === 'merging' && (
                    <span className="flex items-center text-amber-500 font-medium animate-pulse">
                      <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                      Merging streams...
                    </span>
                  )}
                  {item.status === 'downloading' && (
                    <span className="text-apple-blue font-medium">
                      {isPending ? 'Connecting...' : 'Downloading...'}
                    </span>
                  )}
                  {item.status === 'failed' && (
                    <span className="flex items-center text-red-500 font-medium">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Failed
                    </span>
                  )}
                </div>
                <span className="font-semibold text-apple-text-light dark:text-apple-text-dark">
                  {item.status === 'merging' ? '99%' : `${Math.round(item.percent)}%`}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
