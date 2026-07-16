import React from 'react'
import { X, Play, Pause, AlertCircle, RefreshCw, Download } from 'lucide-react'
import { DownloadProgress } from '../../../main/downloader'
import PasteBox from './PasteBox'

interface MiniViewProps {
  queue: DownloadProgress[]
  urlInput: string
  onUrlInputChange: (value: string) => void
  isFetchingInfo: boolean
  format: 'mp4' | 'mp3' | 'file'
  onFormatChange: (format: 'mp4' | 'mp3' | 'file') => void
  resolution: string
  onResolutionChange: (resolution: string) => void
  onStart: (
    id: string,
    url: string,
    format: 'mp4' | 'mp3' | 'best' | 'file' | 'torrent',
    resolution: string
  ) => void
  onStartAll: () => void
  onCancel: (id: string) => void
  onPause?: (id: string) => void
  onResume?: (id: string) => void
}

export default function MiniView({
  queue,
  urlInput,
  onUrlInputChange,
  isFetchingInfo,
  format,
  onFormatChange,
  resolution,
  onResolutionChange,
  onStart,
  onStartAll,
  onCancel,
  onPause,
  onResume
}: MiniViewProps): React.JSX.Element {
  const readyCount = queue.filter((item) => item.status === 'ready').length

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      <PasteBox
        urlInput={urlInput}
        onUrlInputChange={onUrlInputChange}
        isFetchingInfo={isFetchingInfo}
        format={format}
        onFormatChange={onFormatChange}
        resolution={resolution}
        onResolutionChange={onResolutionChange}
        compact
      />

      {readyCount >= 2 && (
        <button
          onClick={onStartAll}
          className="w-full py-1.5 bg-apple-blue hover:bg-apple-blue/90 text-white rounded-xl text-[11px] font-semibold active:scale-[0.98] transition-all"
        >
          Download all ({readyCount})
        </button>
      )}

      {queue.length === 0 && (
        <div className="flex flex-col items-center justify-center py-3 text-center">
          <Play className="w-5 h-5 text-apple-text-secondary-light/40 dark:text-apple-text-secondary-dark/40 mb-1" />
          <span className="text-[11px] text-apple-text-secondary-light dark:text-apple-text-secondary-dark">
            No downloads
          </span>
        </div>
      )}

      <div className="space-y-1.5">
        {queue.map((item) => {
          const isReady = item.status === 'ready'
          const isQueued = item.status === 'queued'
          const isMerging = item.status === 'merging'
          const isFailed = item.status === 'failed'
          const isPaused = item.status === 'paused'
          const isActive = ['downloading', 'merging'].includes(item.status)

          return (
            <div
              key={item.id}
              className="p-2 bg-apple-card-light dark:bg-apple-card-dark border border-apple-border-light dark:border-apple-border-dark rounded-lg"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-apple-text-light dark:text-apple-text-dark truncate flex-1 min-w-0">
                  {item.title || item.fileName || 'Fetching...'}
                </p>
                <div className="flex items-center space-x-1 flex-shrink-0">
                  {isActive && item.format === 'torrent' && onPause && (
                    <button
                      onClick={() => onPause(item.id)}
                      className="p-1 rounded-lg text-apple-text-secondary-light dark:text-apple-text-secondary-dark hover:text-apple-blue hover:bg-apple-blue/10 active:scale-95 transition-all"
                      title="Pause"
                    >
                      <Pause className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isPaused && onResume && (
                    <button
                      onClick={() => onResume(item.id)}
                      className="p-1 rounded-lg text-apple-blue hover:bg-apple-blue/10 active:scale-95 transition-all"
                      title="Resume"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isReady && (
                    <button
                      onClick={() =>
                        onStart(
                          item.id,
                          item.url || '',
                          item.format || 'mp4',
                          item.resolution || '1080'
                        )
                      }
                      className="p-1 rounded-lg text-apple-blue hover:bg-apple-blue/10 active:scale-95 transition-all"
                      title="Download"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => onCancel(item.id)}
                    className="p-1 rounded-lg text-apple-text-secondary-light dark:text-apple-text-secondary-dark hover:text-red-500 hover:bg-red-500/10 active:scale-95 transition-all"
                    title={isReady ? 'Remove' : 'Cancel'}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {(isActive || isFailed || isPaused) && (
                <>
                  <div className="w-full bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark rounded-full h-1 overflow-hidden mt-1.5">
                    <div
                      className={`h-1 rounded-full transition-all duration-300 ${
                        isMerging
                          ? 'bg-amber-500 animate-pulse'
                          : isFailed
                            ? 'bg-red-500'
                            : isPaused
                              ? 'bg-apple-text-secondary-light/50 dark:bg-apple-text-secondary-dark/50'
                              : 'bg-apple-blue'
                      }`}
                      style={{ width: isMerging ? '99%' : isFailed ? '100%' : `${item.percent}%` }}
                    ></div>
                  </div>
                  <p className="text-[10px] text-apple-text-secondary-light dark:text-apple-text-secondary-dark mt-1 flex items-center">
                    {isMerging ? (
                      <>
                        <RefreshCw className="w-2.5 h-2.5 mr-1 animate-spin text-amber-500" />
                        Merging...
                      </>
                    ) : isFailed ? (
                      <>
                        <AlertCircle className="w-2.5 h-2.5 mr-1 text-red-500" />
                        Failed
                      </>
                    ) : isPaused ? (
                      <>
                        <Pause className="w-2.5 h-2.5 mr-1" />
                        Paused · {Math.round(item.percent)}%
                      </>
                    ) : (
                      `${Math.round(item.percent)}%${item.speed ? ` · ${item.speed}` : ''}`
                    )}
                  </p>
                </>
              )}

              {isQueued && (
                <p className="text-[10px] text-apple-text-secondary-light dark:text-apple-text-secondary-dark mt-1 animate-pulse">
                  Queued
                </p>
              )}
              {isReady && (
                <p className="text-[10px] text-apple-text-secondary-light/70 dark:text-apple-text-secondary-dark/70 mt-1 uppercase font-semibold">
                  {item.format === 'mp3'
                    ? 'MP3'
                    : item.format === 'file'
                      ? 'FILE'
                      : item.format === 'torrent'
                        ? 'TORRENT'
                        : `MP4 · ${item.resolution}p`}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
