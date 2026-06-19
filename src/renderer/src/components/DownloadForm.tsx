import React from 'react'
import { RESOLUTION_OPTIONS } from '../constants'

interface DownloadFormProps {
  urlInput: string
  onUrlInputChange: (value: string) => void
  isFetchingInfo: boolean
  format: 'mp4' | 'mp3'
  onFormatChange: (format: 'mp4' | 'mp3') => void
  resolution: string
  onResolutionChange: (resolution: string) => void
}

export default function DownloadForm({
  urlInput,
  onUrlInputChange,
  isFetchingInfo,
  format,
  onFormatChange,
  resolution,
  onResolutionChange
}: DownloadFormProps): React.JSX.Element {
  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
      <div className="flex flex-col space-y-2">
        <label
          htmlFor="url"
          className="text-xs font-semibold uppercase tracking-wider text-apple-text-secondary-light dark:text-apple-text-secondary-dark"
        >
          Video or Playlist URL
        </label>
        <div className="flex">
          <input
            id="url"
            type="text"
            placeholder="Paste YouTube, Vimeo, or other media link here..."
            value={urlInput}
            onChange={(e) => onUrlInputChange(e.target.value)}
            className="flex-1 px-4 py-3 bg-apple-card-light dark:bg-apple-card-dark border border-apple-border-light dark:border-apple-border-dark rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
          />
        </div>
      </div>

      {/* Video Info Preview Skeleton */}
      {isFetchingInfo && (
        <div className="flex items-center space-x-4 p-4 bg-apple-card-light dark:bg-apple-card-dark border border-apple-border-light dark:border-apple-border-dark rounded-2xl animate-pulse">
          <div className="w-32 h-18 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark rounded-xl"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark rounded w-3/4"></div>
            <div className="h-3 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark rounded w-1/2"></div>
          </div>
        </div>
      )}

      {/* Format Settings */}
      <div className="flex flex-col space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-apple-text-secondary-light dark:text-apple-text-secondary-dark">
          Preferred Format
        </span>
        <div className="inline-flex p-1 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark border border-apple-border-light dark:border-apple-border-dark rounded-xl max-w-xs">
          <button
            type="button"
            onClick={() => onFormatChange('mp4')}
            className={`flex-1 px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
              format === 'mp4'
                ? 'bg-apple-card-light dark:bg-apple-card-dark text-apple-text-light dark:text-apple-text-dark shadow-sm'
                : 'text-apple-text-secondary-light dark:text-apple-text-secondary-dark hover:text-apple-text-light dark:hover:text-apple-text-dark'
            }`}
          >
            Video (MP4)
          </button>
          <button
            type="button"
            onClick={() => onFormatChange('mp3')}
            className={`flex-1 px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
              format === 'mp3'
                ? 'bg-apple-card-light dark:bg-apple-card-dark text-apple-text-light dark:text-apple-text-dark shadow-sm'
                : 'text-apple-text-secondary-light dark:text-apple-text-secondary-dark hover:text-apple-text-light dark:hover:text-apple-text-dark'
            }`}
          >
            Audio (MP3)
          </button>
        </div>
      </div>

      {/* Resolution/Quality Settings */}
      {format !== 'mp3' && (
        <div className="flex flex-col space-y-2 mt-4">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-apple-text-secondary-light dark:text-apple-text-secondary-dark">
              Resolution Limit
            </span>
            {isFetchingInfo && (
              <div className="w-3 h-3 border-2 border-apple-blue border-t-transparent rounded-full animate-spin"></div>
            )}
          </div>
          <div className="flex flex-wrap gap-1 p-1 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark border border-apple-border-light dark:border-apple-border-dark rounded-xl max-w-xl">
            {RESOLUTION_OPTIONS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => onResolutionChange(h)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  resolution === h
                    ? 'bg-apple-card-light dark:bg-apple-card-dark text-apple-text-light dark:text-apple-text-dark shadow-sm'
                    : 'text-apple-text-secondary-light dark:text-apple-text-secondary-dark hover:text-apple-text-light dark:hover:text-apple-text-dark'
                }`}
              >
                {h}p
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  )
}
