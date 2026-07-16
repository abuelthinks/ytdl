import React, { useState } from 'react'
import { ClipboardPaste, Loader2 } from 'lucide-react'
import { RESOLUTION_OPTIONS } from '../constants'

interface PasteBoxProps {
  urlInput: string
  onUrlInputChange: (value: string) => void
  isFetchingInfo: boolean
  format: 'mp4' | 'mp3' | 'file'
  onFormatChange: (format: 'mp4' | 'mp3' | 'file') => void
  resolution: string
  onResolutionChange: (resolution: string) => void
  compact?: boolean
}

const chipBase = 'px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer'
const chipActive = 'bg-apple-blue text-white shadow-sm'
const chipIdle =
  'bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark text-apple-text-secondary-light dark:text-apple-text-secondary-dark hover:text-apple-text-light dark:hover:text-apple-text-dark'

export default function PasteBox({
  urlInput,
  onUrlInputChange,
  isFetchingInfo,
  format,
  onFormatChange,
  resolution,
  onResolutionChange,
  compact = false
}: PasteBoxProps): React.JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setIsDragOver(false)

    // Dropped .torrent file from the file manager
    const file = e.dataTransfer.files?.[0]
    if (file && file.name.toLowerCase().endsWith('.torrent')) {
      const filePath = window.api?.getFilePath ? window.api.getFilePath(file) : file.name
      if (filePath) {
        onUrlInputChange(filePath)
      }
      return
    }

    // Dragged link or text
    const text = e.dataTransfer.getData('text/plain')?.trim()
    if (text) {
      onUrlInputChange(text)
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-2xl transition-all ${
        isDragOver
          ? 'border-apple-blue bg-apple-blue/5'
          : 'border-apple-border-light dark:border-apple-border-dark bg-apple-card-light/50 dark:bg-apple-card-dark/50'
      } ${compact ? 'p-2.5' : 'p-5'}`}
    >
      <div className={`flex items-center ${compact ? 'space-x-2' : 'space-x-3'}`}>
        {isFetchingInfo ? (
          <Loader2
            className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-apple-blue animate-spin flex-shrink-0`}
          />
        ) : (
          <ClipboardPaste
            className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-apple-text-secondary-light/60 dark:text-apple-text-secondary-dark/60 flex-shrink-0`}
          />
        )}
        <input
          type="text"
          placeholder={
            isFetchingInfo
              ? 'Fetching video info...'
              : compact
                ? 'Paste link...'
                : 'Paste a video, playlist, file, or magnet link, or drop it here...'
          }
          value={urlInput}
          onChange={(e) => onUrlInputChange(e.target.value)}
          disabled={isFetchingInfo}
          className="flex-1 min-w-0 bg-transparent text-sm text-apple-text-light dark:text-apple-text-dark placeholder:text-apple-text-secondary-light/60 dark:placeholder:text-apple-text-secondary-dark/60 focus:outline-none disabled:opacity-60"
        />
      </div>

      <div
        className={`flex items-center flex-wrap gap-1.5 ${compact ? 'mt-2' : 'mt-4'} ${compact ? '' : 'pl-8'}`}
      >
        <button
          type="button"
          onClick={() => onFormatChange('mp4')}
          className={`${chipBase} ${format === 'mp4' ? chipActive : chipIdle}`}
        >
          MP4
        </button>
        <button
          type="button"
          onClick={() => onFormatChange('mp3')}
          className={`${chipBase} ${format === 'mp3' ? chipActive : chipIdle}`}
        >
          MP3
        </button>
        <button
          type="button"
          onClick={() => onFormatChange('file')}
          title="Download any direct file link (PDF, ZIP, image, etc.)"
          className={`${chipBase} ${format === 'file' ? chipActive : chipIdle}`}
        >
          FILE
        </button>

        {format === 'mp4' && (
          <>
            <span className="w-px h-4 bg-apple-border-light dark:bg-apple-border-dark mx-1" />
            {compact ? (
              <select
                value={resolution}
                onChange={(e) => onResolutionChange(e.target.value)}
                className="px-2 py-1 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark rounded-lg text-[10px] font-semibold text-apple-text-light dark:text-apple-text-dark focus:outline-none cursor-pointer"
              >
                {RESOLUTION_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {h}p
                  </option>
                ))}
              </select>
            ) : (
              RESOLUTION_OPTIONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => onResolutionChange(h)}
                  className={`${chipBase} ${resolution === h ? chipActive : chipIdle}`}
                >
                  {h}p
                </button>
              ))
            )}
          </>
        )}
      </div>
    </div>
  )
}
